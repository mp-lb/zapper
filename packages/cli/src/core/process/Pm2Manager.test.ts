import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from "fs";
import path from "path";
import { Pm2Manager } from "./Pm2Manager";
import { Process } from "../../config/schemas";
import { renderer } from "../../ui/renderer";

describe("Pm2Manager - Wrapper Script Lifecycle", () => {
  const testDir = path.join(__dirname, ".test-zap");
  const zapDir = path.join(testDir, ".zap");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    mkdirSync(zapDir, { recursive: true });

    const runPm2Spy = vi.spyOn(Pm2Manager as any, "runPm2Command");
    runPm2Spy.mockResolvedValue("");

    const listProcessesSpy = vi.spyOn(Pm2Manager as any, "listProcesses");
    listProcessesSpy.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should clean up wrapper scripts directly", () => {
    writeFileSync(
      path.join(zapDir, "test-project.test-service.123.sh"),
      "#!/bin/bash\necho test",
    );

    writeFileSync(
      path.join(zapDir, "test-project.test-service.456.sh"),
      "#!/bin/bash\necho test",
    );

    writeFileSync(
      path.join(zapDir, "other-project.other-service.789.sh"),
      "#!/bin/bash\necho test",
    );

    const filesBefore = readdirSync(zapDir);
    expect(filesBefore.filter((f) => f.endsWith(".sh")).length).toBe(3);

    (Pm2Manager as any).cleanupWrapperScripts(
      "test-project",
      "test-service",
      testDir,
    );

    const filesAfter = readdirSync(zapDir);
    const scriptsAfter = filesAfter.filter((f) => f.endsWith(".sh"));

    expect(scriptsAfter.length).toBe(1);
    expect(scriptsAfter[0]).toBe("other-project.other-service.789.sh");
  });

  it("should keep wrapper script after starting process", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "echo 'test'",
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const files = readdirSync(zapDir);

    const wrapperScripts = files.filter(
      (f) => f.includes("test-project.test-service") && f.endsWith(".sh"),
    );

    expect(wrapperScripts.length).toBeGreaterThan(0);
  });

  it("configures PM2 to merge stdout and stderr into one managed log file", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "node server.js",
    };

    let ecosystemJson: string | undefined;
    vi.spyOn(Pm2Manager as any, "runPm2Command").mockImplementation(
      async (args: string[]) => {
        if (args[0] === "start") {
          ecosystemJson = readFileSync(args[1], "utf8");
        }

        return "";
      },
    );

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    expect(ecosystemJson).toBeDefined();

    const ecosystem = JSON.parse(ecosystemJson!) as {
      apps: Array<Record<string, unknown>>;
    };

    // PM2 7 ignores the `log` attribute, so the managed log file must be
    // configured through out_file/error_file pointing at the same path.
    const managedLog = path.join(
      zapDir,
      "logs",
      "test-project.test-service.log",
    );

    expect(ecosystem.apps[0]).toMatchObject({
      name: "zap.test-project.test-service",
      out_file: managedLog,
      error_file: managedLog,
      merge_logs: true,
    });

    expect(ecosystem.apps[0]).not.toHaveProperty("log");
  });

  it("namespaces the managed log file by instance ID", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "node server.js",
    };

    let ecosystemJson: string | undefined;
    vi.spyOn(Pm2Manager as any, "runPm2Command").mockImplementation(
      async (args: string[]) => {
        if (args[0] === "start") {
          ecosystemJson = readFileSync(args[1], "utf8");
        }

        return "";
      },
    );

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
      "abc123",
    );

    const ecosystem = JSON.parse(ecosystemJson!) as {
      apps: Array<Record<string, unknown>>;
    };

    const managedLog = path.join(
      zapDir,
      "logs",
      "test-project.abc123.test-service.log",
    );

    expect(ecosystem.apps[0]).toMatchObject({
      name: "zap.test-project.abc123.test-service",
      out_file: managedLog,
      error_file: managedLog,
    });
  });

  it("only cleans up the stopped stack's log file, not other stacks' logs", async () => {
    const logsDir = path.join(zapDir, "logs");
    mkdirSync(logsDir, { recursive: true });

    const ownLog = path.join(logsDir, "test-project.abc123.test-service.log");
    const otherLog = path.join(logsDir, "test-project.zzz999.test-service.log");
    writeFileSync(ownLog, "own\n");
    writeFileSync(otherLog, "other\n");

    vi.spyOn(Pm2Manager as any, "runPm2Command").mockResolvedValue("[]");

    await Pm2Manager.deleteProcess(
      "test-service",
      "test-project",
      testDir,
      "abc123",
    );

    expect(existsSync(ownLog)).toBe(false);
    expect(existsSync(otherLog)).toBe(true);
  });

  it("wraps mise runtime processes with structured tool args", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "pnpm dev",
      runtime: {
        provider: "mise",
        node: "20",
        pnpm: "latest",
      },
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const wrapperScript = readdirSync(zapDir).find(
      (file) =>
        file.includes("test-project.test-service") && file.endsWith(".sh"),
    );

    expect(wrapperScript).toBeTruthy();

    const content = readFileSync(path.join(zapDir, wrapperScript!), "utf8");

    expect(content).toContain(
      "exec mise exec 'node@20' 'pnpm@latest' -- bash -lc 'pnpm dev'",
    );
  });

  it("quotes shell commands in mise wrappers", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "node -e \"console.log('hello')\"",
      runtime: {
        provider: "mise",
        node: "lts",
      },
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const wrapperScript = readdirSync(zapDir).find(
      (file) =>
        file.includes("test-project.test-service") && file.endsWith(".sh"),
    );

    expect(wrapperScript).toBeTruthy();

    const content = readFileSync(path.join(zapDir, wrapperScript!), "utf8");

    expect(content).toContain(
      `exec mise exec 'node@lts' -- bash -lc 'node -e "console.log('\\''hello'\\'')"'\n`,
    );
  });

  it("should clean up old wrapper scripts when starting new instance", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "echo 'test'",
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const firstFiles = readdirSync(zapDir);
    const firstScripts = firstFiles.filter((f) => f.endsWith(".sh"));
    expect(firstScripts.length).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const secondFiles = readdirSync(zapDir);
    const secondScripts = secondFiles.filter((f) => f.endsWith(".sh"));

    expect(secondScripts.length).toBe(1);
    expect(secondScripts[0]).not.toBe(firstScripts[0]);
  });

  it("should clean up wrapper scripts when deleting process", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "echo 'test'",
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const filesAfterStart = readdirSync(zapDir);
    const scriptsAfterStart = filesAfterStart.filter((f) => f.endsWith(".sh"));
    expect(scriptsAfterStart.length).toBe(1);

    // Manually call cleanup since deleteAllMatchingProcesses is wrapped in try-catch
    (Pm2Manager as any).cleanupWrapperScripts(
      "test-project",
      "test-service",
      testDir,
    );

    const filesAfterDelete = readdirSync(zapDir);

    const scriptsAfterDelete = filesAfterDelete.filter((f) =>
      f.endsWith(".sh"),
    );

    expect(scriptsAfterDelete.length).toBe(0);
  });

  it("should only clean up scripts for specific process", async () => {
    const process1: Process = {
      name: "service-one",
      cmd: "echo 'one'",
    };

    const process2: Process = {
      name: "service-two",
      cmd: "echo 'two'",
    };

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      process1,
      testDir,
    );

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      process2,
      testDir,
    );

    const filesAfterStart = readdirSync(zapDir);
    const scriptsAfterStart = filesAfterStart.filter((f) => f.endsWith(".sh"));
    expect(scriptsAfterStart.length).toBe(2);

    // Manually call cleanup for service-one
    (Pm2Manager as any).cleanupWrapperScripts(
      "test-project",
      "service-one",
      testDir,
    );

    const filesAfterDelete = readdirSync(zapDir);

    const scriptsAfterDelete = filesAfterDelete.filter((f) =>
      f.endsWith(".sh"),
    );

    expect(scriptsAfterDelete.length).toBe(1);
    expect(scriptsAfterDelete[0]).toContain("service-two");
  });

  it("shows the last saved log when the PM2 process is gone", async () => {
    const logsDir = path.join(zapDir, "logs");
    const logPath = path.join(logsDir, "test-project.test-service.log");
    const mtime = new Date(2026, 5, 7, 14, 32, 10);

    mkdirSync(logsDir, { recursive: true });
    writeFileSync(logPath, "crash output\n");
    utimesSync(logPath, mtime, mtime);

    const showLogsFromFileSpy = vi
      .spyOn(Pm2Manager as any, "showLogsFromFile")
      .mockResolvedValue(undefined);

    const warnSpy = vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    await Pm2Manager.showLogs("test-service", "test-project", true, testDir);

    expect(warnSpy).toHaveBeenCalledWith(
      "test-service is not currently running. Showing logs for the last run from 2026-06-07 14:32:10.",
    );

    expect(showLogsFromFileSpy).toHaveBeenCalledWith(logPath, false);
  });

  it("uses PM2 logs directly for running services without following by default", async () => {
    vi.spyOn(Pm2Manager as any, "getProcessInfo").mockResolvedValue({
      name: "zap.test-project.test-service",
    });

    const showLogsWithPm2Spy = vi
      .spyOn(Pm2Manager as any, "showLogsWithPm2")
      .mockResolvedValue(undefined);

    await Pm2Manager.showLogs("test-service", "test-project", false, testDir);

    expect(showLogsWithPm2Spy).toHaveBeenCalledWith(
      "zap.test-project.test-service",
      false,
    );
  });

  it("uses PM2 logs directly for running services with follow enabled", async () => {
    vi.spyOn(Pm2Manager as any, "getProcessInfo").mockResolvedValue({
      name: "zap.test-project.test-service",
    });

    const showLogsWithPm2Spy = vi
      .spyOn(Pm2Manager as any, "showLogsWithPm2")
      .mockResolvedValue(undefined);

    await Pm2Manager.showLogs("test-service", "test-project", true, testDir);

    expect(showLogsWithPm2Spy).toHaveBeenCalledWith(
      "zap.test-project.test-service",
      true,
    );
  });

  it("passes --nostream only for non-follow PM2 logs", async () => {
    const resolvePm2CommandSpy = vi
      .spyOn(Pm2Manager as any, "resolvePm2Command")
      .mockImplementation((args: string[]) => ({
        command: globalThis.process.execPath,
        argsPrefix: ["-e", ""],
        label: `pm2 ${args.join(" ")}`,
      }));

    await (Pm2Manager as any).showLogsWithPm2("zap.test-project.api", false);
    await (Pm2Manager as any).showLogsWithPm2("zap.test-project.api", true);

    expect(resolvePm2CommandSpy).toHaveBeenNthCalledWith(1, [
      "logs",
      "zap.test-project.api",
      "--lines",
      "50",
      "--nostream",
    ]);

    expect(resolvePm2CommandSpy).toHaveBeenNthCalledWith(2, [
      "logs",
      "zap.test-project.api",
      "--lines",
      "50",
    ]);
  });

  it("warns clearly when no last-run log exists", async () => {
    const showLogsFromFileSpy = vi.spyOn(Pm2Manager as any, "showLogsFromFile");

    const warnSpy = vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    await Pm2Manager.showLogs("test-service", "test-project", true, testDir);

    expect(warnSpy).toHaveBeenCalledWith(
      "No log file found for test-service. The service may never have started.",
    );

    expect(showLogsFromFileSpy).not.toHaveBeenCalled();
  });
});

describe("Pm2Manager - Crash-loop and daemon-kill recovery", () => {
  const testDir = path.join(__dirname, ".test-zap-recovery");
  const zapDir = path.join(testDir, ".zap");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    mkdirSync(zapDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function processInfo(overrides: Record<string, unknown>) {
    return {
      name: "zap.proj.abc123.api",
      pid: 42,
      status: "online",
      uptime: 100,
      memory: 1,
      cpu: 0,
      restarts: 0,
      ...overrides,
    };
  }

  it("throttles late-onset crash loops with exponential backoff in the ecosystem", async () => {
    let ecosystemJson: string | undefined;

    vi.spyOn(Pm2Manager as any, "runPm2Command").mockImplementation(
      async (...callArgs: unknown[]) => {
        const args = callArgs[0] as string[];
        if (args[0] === "start") ecosystemJson = readFileSync(args[1], "utf8");
        return "";
      },
    );

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([]);

    await Pm2Manager.startProcessWithTempEcosystem(
      "test-project",
      { name: "svc", cmd: "node server.js" },
      testDir,
    );

    const ecosystem = JSON.parse(ecosystemJson!) as {
      apps: Array<Record<string, unknown>>;
    };

    // PM2 only counts unstable restarts shortly after created_at, so
    // max_restarts alone cannot stop an app that starts crashing later in
    // life. Backoff is the safety net that throttles such loops.
    expect(ecosystem.apps[0].exp_backoff_restart_delay).toBe(100);
    expect(ecosystem.apps[0].max_restarts).toBe(2);
    expect(ecosystem.apps[0].min_uptime).toBe(4000);
  });

  it("identifies registrations whose wrapper script is missing", () => {
    const liveScript = path.join(zapDir, "proj.svc.111.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    expect(Pm2Manager.hasMissingWrapperScript({ script: liveScript })).toBe(
      false,
    );

    expect(
      Pm2Manager.hasMissingWrapperScript({
        script: "/gone/dir/.zap/proj.svc.222.sh",
      }),
    ).toBe(true);

    // Non-Zapper scripts are never treated as wrapper registrations
    expect(
      Pm2Manager.hasMissingWrapperScript({ script: "/gone/dir/app.js" }),
    ).toBe(false);

    expect(Pm2Manager.hasMissingWrapperScript({ script: "" })).toBe(false);
  });

  it("deregisters instead of restarting when the wrapper script is gone", async () => {
    const runPm2Spy = vi
      .spyOn(Pm2Manager as any, "runPm2Command")
      .mockResolvedValue("");

    vi.spyOn(Pm2Manager, "getProcessInfo").mockResolvedValue(
      processInfo({
        script: "/gone/dir/.zap/proj.api.333.sh",
        pid: 0,
      }) as any,
    );

    await expect(
      Pm2Manager.restartProcess("api", "proj", "abc123"),
    ).rejects.toThrow(/wrapper script no longer exists/);

    expect(runPm2Spy).toHaveBeenCalledWith(["delete", "zap.proj.abc123.api"]);

    expect(runPm2Spy).not.toHaveBeenCalledWith([
      "restart",
      "zap.proj.abc123.api",
    ]);
  });

  it("restarts normally when the wrapper script exists", async () => {
    const liveScript = path.join(zapDir, "proj.api.444.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    const runPm2Spy = vi
      .spyOn(Pm2Manager as any, "runPm2Command")
      .mockResolvedValue("");

    vi.spyOn(Pm2Manager, "getProcessInfo").mockResolvedValue(
      processInfo({ script: liveScript, pid: 0 }) as any,
    );

    await Pm2Manager.restartProcess("api", "proj", "abc123");

    expect(runPm2Spy).toHaveBeenCalledWith(["restart", "zap.proj.abc123.api"]);
  });

  it("deregisters all apps whose wrapper scripts are missing", async () => {
    const liveScript = path.join(zapDir, "proj.live.555.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    const runPm2Spy = vi
      .spyOn(Pm2Manager as any, "runPm2Command")
      .mockResolvedValue("");

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([
      processInfo({ name: "zap.proj.abc123.live", script: liveScript }),
      processInfo({
        name: "zap.gone.def456.api",
        script: "/gone/.zap/gone.api.666.sh",
        pid: 0,
      }),
    ] as any);

    vi.spyOn(Pm2Manager, "getProcessInfo").mockResolvedValue(null);
    vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    const removed = await Pm2Manager.deregisterMissingScriptApps();

    expect(removed).toEqual(["zap.gone.def456.api"]);
    expect(runPm2Spy).toHaveBeenCalledWith(
      ["delete", "zap.gone.def456.api"],
      1,
    );

    expect(runPm2Spy).not.toHaveBeenCalledWith(
      ["delete", "zap.proj.abc123.live"],
      expect.anything(),
    );
  });

  it("deregisters every app under a .zap dir before it is deleted", async () => {
    const insideScript = path.join(zapDir, "proj.api.777.sh");
    writeFileSync(insideScript, "#!/bin/bash\n");

    const runPm2Spy = vi
      .spyOn(Pm2Manager as any, "runPm2Command")
      .mockResolvedValue("");

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([
      processInfo({ name: "zap.proj.abc123.api", script: insideScript }),
      processInfo({
        name: "zap.other.xyz789.api",
        script: "/elsewhere/.zap/other.api.888.sh",
      }),
    ] as any);

    vi.spyOn(Pm2Manager, "getProcessInfo").mockResolvedValue(null);

    const removed = await Pm2Manager.deregisterAppsUnderZapDir(zapDir);

    expect(removed).toEqual(["zap.proj.abc123.api"]);
    expect(runPm2Spy).toHaveBeenCalledWith(["delete", "zap.proj.abc123.api"]);
    expect(runPm2Spy).not.toHaveBeenCalledWith([
      "delete",
      "zap.other.xyz789.api",
    ]);
  });

  it("recovers the daemon by snapshot, kill, survivor sweep, resurrect, and stale-app sweep", async () => {
    const calls: string[][] = [];

    const runPm2Spy = vi
      .spyOn(Pm2Manager as any, "runPm2Command")
      .mockImplementation(async (...callArgs: unknown[]) => {
        calls.push(callArgs[0] as string[]);
        return "";
      });

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([
      processInfo({}),
    ] as any);

    const { OrphanScanner } = await import("../../system/OrphanScanner");

    const scannerSpy = vi
      .spyOn(OrphanScanner, "listWrapperProcesses")
      .mockReturnValue([]);

    const sweepSpy = vi
      .spyOn(Pm2Manager, "deregisterMissingScriptApps")
      .mockResolvedValue([]);

    await (Pm2Manager as any).recoverPm2Daemon();

    expect(calls).toEqual([["save"], ["kill"], ["resurrect"]]);
    expect(scannerSpy).toHaveBeenCalled();
    expect(sweepSpy).toHaveBeenCalled();
    expect(runPm2Spy).toHaveBeenCalledWith(["kill"], 1);
  });

  it("skips resurrect when the pre-kill snapshot failed", async () => {
    const calls: string[][] = [];

    vi.spyOn(Pm2Manager as any, "runPm2Command").mockImplementation(
      async (...callArgs: unknown[]) => {
        const args = callArgs[0] as string[];
        calls.push(args);
        if (args[0] === "save") throw new Error("save failed");
        return "";
      },
    );

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([
      processInfo({}),
    ] as any);

    const { OrphanScanner } = await import("../../system/OrphanScanner");
    vi.spyOn(OrphanScanner, "listWrapperProcesses").mockReturnValue([]);
    vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    const sweepSpy = vi.spyOn(Pm2Manager, "deregisterMissingScriptApps");

    await (Pm2Manager as any).recoverPm2Daemon();

    expect(calls).toEqual([["save"], ["kill"]]);
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it("never resurrects a stale dump when the table was empty before the kill", async () => {
    const calls: string[][] = [];

    vi.spyOn(Pm2Manager as any, "runPm2Command").mockImplementation(
      async (...callArgs: unknown[]) => {
        calls.push(callArgs[0] as string[]);
        return "";
      },
    );

    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([]);

    const { OrphanScanner } = await import("../../system/OrphanScanner");
    vi.spyOn(OrphanScanner, "listWrapperProcesses").mockReturnValue([]);

    await (Pm2Manager as any).recoverPm2Daemon();

    expect(calls).toEqual([["kill"]]);
  });
});
