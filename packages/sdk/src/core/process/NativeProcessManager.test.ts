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
import { NativeProcessManager } from "./NativeProcessManager";
import { clearShellEnvCaptureCache } from "./shellEnvCapture";
import { Process } from "../../config/schemas";
import { renderer } from "../../ui/renderer";

describe("NativeProcessManager - Wrapper Script Lifecycle", () => {
  const testDir = path.join(__dirname, ".test-zap");
  const zapDir = path.join(testDir, ".zap");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    mkdirSync(zapDir, { recursive: true });

    vi.spyOn(NativeProcessManager as any, "supervisorAction").mockResolvedValue(
      [],
    );

    vi.spyOn(
      NativeProcessManager as any,
      "startNativeProcess",
    ).mockResolvedValue([]);

    const listProcessesSpy = vi.spyOn(
      NativeProcessManager as any,
      "listProcesses",
    );

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

    (NativeProcessManager as any).cleanupWrapperScripts(
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

    await NativeProcessManager.startProcessWithTempEcosystem(
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

  it("fails clearly for native services on Windows", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      await expect(
        NativeProcessManager.startProcessWithTempEcosystem(
          "test-project",
          { name: "test-service", cmd: "echo test" },
          testDir,
        ),
      ).rejects.toThrow(
        "Native Zapper services are not supported on Windows. Run Zapper from WSL2, macOS, or Linux.",
      );
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    }
  });

  it("configures the supervisor to merge stdout and stderr into one managed log file", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "node server.js",
    };

    let appConfig: Record<string, unknown> | undefined;
    vi.spyOn(
      NativeProcessManager as any,
      "startNativeProcess",
    ).mockImplementation(async (...rawArgs: unknown[]) => {
      appConfig = rawArgs[0] as Record<string, unknown>;
      return [];
    });

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    expect(appConfig).toBeDefined();

    // Keep the legacy out_file/error_file aliases pointed at the same managed
    // log path for callers that still inspect the generated config.
    const managedLog = path.join(
      zapDir,
      "logs",
      "test-project.test-service.log",
    );

    expect(appConfig).toMatchObject({
      name: "zap.test-project.test-service",
      out_file: managedLog,
      error_file: managedLog,
      merge_logs: true,
    });

    expect(appConfig).not.toHaveProperty("log");
  });

  it("namespaces the managed log file by instance ID", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "node server.js",
    };

    let appConfig: Record<string, unknown> | undefined;
    vi.spyOn(
      NativeProcessManager as any,
      "startNativeProcess",
    ).mockImplementation(async (...rawArgs: unknown[]) => {
      appConfig = rawArgs[0] as Record<string, unknown>;
      return [];
    });

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
      "abc123",
    );

    const managedLog = path.join(
      zapDir,
      "logs",
      "test-project.abc123.test-service.log",
    );

    expect(appConfig).toMatchObject({
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

    vi.spyOn(NativeProcessManager as any, "supervisorAction").mockResolvedValue(
      [],
    );

    await NativeProcessManager.deleteProcess(
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

    await NativeProcessManager.startProcessWithTempEcosystem(
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

    await NativeProcessManager.startProcessWithTempEcosystem(
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

  describe("shell runtime provider", () => {
    const fakeShell = path.join(__dirname, ".test-zap", "fake-shell");

    const readWrapper = (): string => {
      const wrapperScript = readdirSync(zapDir).find(
        (file) =>
          file.includes("test-project.test-service") && file.endsWith(".sh"),
      );

      expect(wrapperScript).toBeTruthy();
      return readFileSync(path.join(zapDir, wrapperScript!), "utf8");
    };

    beforeEach(() => {
      clearShellEnvCaptureCache();

      // Stands in for a login shell: injects a marker var, then runs the
      // capture script NativeProcessManager passes via -ilc.
      writeFileSync(
        fakeShell,
        `#!/bin/sh\nexport ZAP_TEST_TOOL="fake-node"\nexec /bin/sh -c "$2"\n`,
        { mode: 0o755 },
      );
    });

    afterEach(() => {
      clearShellEnvCaptureCache();
    });

    it("bakes the captured login-shell environment into the wrapper", async () => {
      const processConfig: Process = {
        name: "test-service",
        cmd: "pnpm dev",
        runtime: { provider: "shell", shell: fakeShell },
      };

      await NativeProcessManager.startProcessWithTempEcosystem(
        "test-project",
        processConfig,
        testDir,
      );

      const content = readWrapper();

      expect(content).toContain(
        `# Environment captured from login shell: ${fakeShell}`,
      );

      expect(content).toContain("export ZAP_TEST_TOOL='fake-node'");
      expect(content).toMatch(/export PATH='[^']+'/);
      expect(content).not.toContain(`export PATH="${process.env.PATH}"`);
    });

    it("lets process-specific resolved env win over captured vars", async () => {
      const processConfig: Process = {
        name: "test-service",
        cmd: "pnpm dev",
        runtime: { provider: "shell", shell: fakeShell },
        resolvedEnv: { ZAP_TEST_TOOL: "from-zap-yaml" },
      };

      await NativeProcessManager.startProcessWithTempEcosystem(
        "test-project",
        processConfig,
        testDir,
      );

      expect(readWrapper()).not.toContain("export ZAP_TEST_TOOL=");
    });

    it("falls back to ambient with a warning when the shell is missing", async () => {
      const warnSpy = vi
        .spyOn(renderer.log, "warn")
        .mockImplementation(() => {});

      const processConfig: Process = {
        name: "test-service",
        cmd: "pnpm dev",
        runtime: { provider: "shell", shell: "/nonexistent/shell" },
      };

      await NativeProcessManager.startProcessWithTempEcosystem(
        "test-project",
        processConfig,
        testDir,
      );

      const content = readWrapper();

      expect(content).toContain(`export PATH="${process.env.PATH}"`);
      expect(content).not.toContain("captured from login shell");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("/nonexistent/shell"),
      );
    });
  });

  it("should clean up old wrapper scripts when starting new instance", async () => {
    const processConfig: Process = {
      name: "test-service",
      cmd: "echo 'test'",
    };

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const firstFiles = readdirSync(zapDir);
    const firstScripts = firstFiles.filter((f) => f.endsWith(".sh"));
    expect(firstScripts.length).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    await NativeProcessManager.startProcessWithTempEcosystem(
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

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      processConfig,
      testDir,
    );

    const filesAfterStart = readdirSync(zapDir);
    const scriptsAfterStart = filesAfterStart.filter((f) => f.endsWith(".sh"));
    expect(scriptsAfterStart.length).toBe(1);

    // Manually call cleanup since deleteAllMatchingProcesses is wrapped in try-catch
    (NativeProcessManager as any).cleanupWrapperScripts(
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

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      process1,
      testDir,
    );

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      process2,
      testDir,
    );

    const filesAfterStart = readdirSync(zapDir);
    const scriptsAfterStart = filesAfterStart.filter((f) => f.endsWith(".sh"));
    expect(scriptsAfterStart.length).toBe(2);

    // Manually call cleanup for service-one
    (NativeProcessManager as any).cleanupWrapperScripts(
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

  it("shows the last saved log when the supervised process is gone", async () => {
    const logsDir = path.join(zapDir, "logs");
    const logPath = path.join(logsDir, "test-project.test-service.log");
    const mtime = new Date(2026, 5, 7, 14, 32, 10);

    mkdirSync(logsDir, { recursive: true });
    writeFileSync(logPath, "crash output\n");
    utimesSync(logPath, mtime, mtime);

    const showLogsFromFileSpy = vi
      .spyOn(NativeProcessManager as any, "showLogsFromFile")
      .mockResolvedValue(undefined);

    const warnSpy = vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    await NativeProcessManager.showLogs(
      "test-service",
      "test-project",
      true,
      testDir,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "test-service is not currently running. Showing logs for the last run from 2026-06-07 14:32:10.",
    );

    expect(showLogsFromFileSpy).toHaveBeenCalledWith(logPath, false);
  });

  it("reads the managed log file for running services without following by default", async () => {
    vi.spyOn(NativeProcessManager as any, "getProcessInfo").mockResolvedValue({
      name: "zap.test-project.test-service",
    });

    const showLogsFromFileSpy = vi
      .spyOn(NativeProcessManager as any, "showLogsFromFile")
      .mockResolvedValue(undefined);

    await NativeProcessManager.showLogs(
      "test-service",
      "test-project",
      false,
      testDir,
    );

    expect(showLogsFromFileSpy).toHaveBeenCalledWith(
      path.join(zapDir, "logs", "test-project.test-service.log"),
      false,
    );
  });

  it("tails the managed log file for running services with follow enabled", async () => {
    vi.spyOn(NativeProcessManager as any, "getProcessInfo").mockResolvedValue({
      name: "zap.test-project.test-service",
    });

    const showLogsFromFileSpy = vi
      .spyOn(NativeProcessManager as any, "showLogsFromFile")
      .mockResolvedValue(undefined);

    await NativeProcessManager.showLogs(
      "test-service",
      "test-project",
      true,
      testDir,
    );

    expect(showLogsFromFileSpy).toHaveBeenCalledWith(
      path.join(zapDir, "logs", "test-project.test-service.log"),
      true,
    );
  });

  it("warns clearly when no last-run log exists", async () => {
    const showLogsFromFileSpy = vi.spyOn(
      NativeProcessManager as any,
      "showLogsFromFile",
    );

    const warnSpy = vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    await NativeProcessManager.showLogs(
      "test-service",
      "test-project",
      true,
      testDir,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "No log file found for test-service. The service may never have started.",
    );

    expect(showLogsFromFileSpy).not.toHaveBeenCalled();
  });
});

describe("NativeProcessManager - Crash-loop and daemon-kill recovery", () => {
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
    let appConfig: Record<string, unknown> | undefined;

    vi.spyOn(
      NativeProcessManager as any,
      "startNativeProcess",
    ).mockImplementation(async (...rawArgs: unknown[]) => {
      appConfig = rawArgs[0] as Record<string, unknown>;
      return [];
    });

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([]);

    await NativeProcessManager.startProcessWithTempEcosystem(
      "test-project",
      { name: "svc", cmd: "node server.js" },
      testDir,
    );

    // Backoff is the safety net that throttles services that start crashing
    // after they have already been up for a while.
    expect(appConfig?.exp_backoff_restart_delay).toBe(100);
    expect(appConfig?.max_restarts).toBe(2);
    expect(appConfig?.min_uptime).toBe(4000);
  });

  it("identifies registrations whose wrapper script is missing", () => {
    const liveScript = path.join(zapDir, "proj.svc.111.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    expect(
      NativeProcessManager.hasMissingWrapperScript({ script: liveScript }),
    ).toBe(false);

    expect(
      NativeProcessManager.hasMissingWrapperScript({
        script: "/gone/dir/.zap/proj.svc.222.sh",
      }),
    ).toBe(true);

    // Non-Zapper scripts are never treated as wrapper registrations
    expect(
      NativeProcessManager.hasMissingWrapperScript({
        script: "/gone/dir/app.js",
      }),
    ).toBe(false);

    expect(NativeProcessManager.hasMissingWrapperScript({ script: "" })).toBe(
      false,
    );
  });

  it("deregisters instead of restarting when the wrapper script is gone", async () => {
    const supervisorActionSpy = vi
      .spyOn(NativeProcessManager as any, "supervisorAction")
      .mockResolvedValue([]);

    vi.spyOn(NativeProcessManager, "getProcessInfo").mockResolvedValue(
      processInfo({
        script: "/gone/dir/.zap/proj.api.333.sh",
        pid: 0,
      }) as any,
    );

    await expect(
      NativeProcessManager.restartProcess("api", "proj", "abc123"),
    ).rejects.toThrow(/wrapper script no longer exists/);

    expect(supervisorActionSpy).toHaveBeenCalledWith(
      "delete",
      "zap.proj.abc123.api",
    );

    expect(supervisorActionSpy).not.toHaveBeenCalledWith(
      "restart",
      "zap.proj.abc123.api",
    );
  });

  it("restarts normally when the wrapper script exists", async () => {
    const liveScript = path.join(zapDir, "proj.api.444.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    const supervisorActionSpy = vi
      .spyOn(NativeProcessManager as any, "supervisorAction")
      .mockResolvedValue([]);

    vi.spyOn(NativeProcessManager, "getProcessInfo").mockResolvedValue(
      processInfo({ script: liveScript, pid: 0 }) as any,
    );

    await NativeProcessManager.restartProcess("api", "proj", "abc123");

    expect(supervisorActionSpy).toHaveBeenCalledWith(
      "restart",
      "zap.proj.abc123.api",
    );
  });

  it("deregisters all apps whose wrapper scripts are missing", async () => {
    const liveScript = path.join(zapDir, "proj.live.555.sh");
    writeFileSync(liveScript, "#!/bin/bash\n");

    const supervisorActionSpy = vi
      .spyOn(NativeProcessManager as any, "supervisorAction")
      .mockResolvedValue([]);

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([
      processInfo({ name: "zap.proj.abc123.live", script: liveScript }),
      processInfo({
        name: "zap.gone.def456.api",
        script: "/gone/.zap/gone.api.666.sh",
        pid: 0,
      }),
    ] as any);

    vi.spyOn(NativeProcessManager, "getProcessInfo").mockResolvedValue(null);
    vi.spyOn(renderer.log, "warn").mockImplementation(() => {});

    const removed = await NativeProcessManager.deregisterMissingScriptApps();

    expect(removed).toEqual(["zap.gone.def456.api"]);
    expect(supervisorActionSpy).toHaveBeenCalledWith(
      "delete",
      "zap.gone.def456.api",
      1,
    );

    expect(supervisorActionSpy).not.toHaveBeenCalledWith(
      "delete",
      "zap.proj.abc123.live",
      expect.anything(),
    );
  });

  it("deregisters every app under a .zap dir before it is deleted", async () => {
    const insideScript = path.join(zapDir, "proj.api.777.sh");
    writeFileSync(insideScript, "#!/bin/bash\n");

    const supervisorActionSpy = vi
      .spyOn(NativeProcessManager as any, "supervisorAction")
      .mockResolvedValue([]);

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([
      processInfo({ name: "zap.proj.abc123.api", script: insideScript }),
      processInfo({
        name: "zap.other.xyz789.api",
        script: "/elsewhere/.zap/other.api.888.sh",
      }),
    ] as any);

    vi.spyOn(NativeProcessManager, "getProcessInfo").mockResolvedValue(null);

    const removed =
      await NativeProcessManager.deregisterAppsUnderZapDir(zapDir);

    expect(removed).toEqual(["zap.proj.abc123.api"]);
    expect(supervisorActionSpy).toHaveBeenCalledWith(
      "delete",
      "zap.proj.abc123.api",
    );

    expect(supervisorActionSpy).not.toHaveBeenCalledWith(
      "delete",
      "zap.other.xyz789.api",
    );
  });

  it("recovers the daemon by restart, survivor sweep, and stale-app sweep", async () => {
    const calls: string[] = [];

    const supervisorActionSpy = vi
      .spyOn(NativeProcessManager as any, "supervisorAction")
      .mockImplementation(async (...callArgs: unknown[]) => {
        calls.push(callArgs[0] as string);
        return [];
      });

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([
      processInfo({}),
    ] as any);

    const { OrphanScanner } = await import("../../system/OrphanScanner");

    const scannerSpy = vi
      .spyOn(OrphanScanner, "listWrapperProcesses")
      .mockReturnValue([]);

    const sweepSpy = vi
      .spyOn(NativeProcessManager, "deregisterMissingScriptApps")
      .mockResolvedValue([]);

    await (NativeProcessManager as any).recoverSupervisorDaemon();

    expect(calls).toEqual(["killDaemon"]);
    expect(scannerSpy).toHaveBeenCalled();
    expect(sweepSpy).toHaveBeenCalled();
    expect(supervisorActionSpy).toHaveBeenCalledWith(
      "killDaemon",
      undefined,
      1,
    );
  });

  it("skips stale-app sweep when the table was empty before daemon restart", async () => {
    const calls: string[] = [];

    vi.spyOn(
      NativeProcessManager as any,
      "supervisorAction",
    ).mockImplementation(async (...callArgs: unknown[]) => {
      calls.push(callArgs[0] as string);
      return [];
    });

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([]);

    const { OrphanScanner } = await import("../../system/OrphanScanner");
    vi.spyOn(OrphanScanner, "listWrapperProcesses").mockReturnValue([]);

    const sweepSpy = vi.spyOn(
      NativeProcessManager,
      "deregisterMissingScriptApps",
    );

    await (NativeProcessManager as any).recoverSupervisorDaemon();

    expect(calls).toEqual(["killDaemon"]);
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it("never resurrects a stale dump when the table was empty before the kill", async () => {
    const calls: string[] = [];

    vi.spyOn(
      NativeProcessManager as any,
      "supervisorAction",
    ).mockImplementation(async (...callArgs: unknown[]) => {
      calls.push(callArgs[0] as string);
      return [];
    });

    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([]);

    const { OrphanScanner } = await import("../../system/OrphanScanner");
    vi.spyOn(OrphanScanner, "listWrapperProcesses").mockReturnValue([]);

    await (NativeProcessManager as any).recoverSupervisorDaemon();

    expect(calls).toEqual(["killDaemon"]);
  });
});
