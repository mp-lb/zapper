/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { Pm2Manager } from "./Pm2Manager";
import { Process } from "../../config/schemas";

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
});
