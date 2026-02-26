import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Pm2Executor } from "./Pm2Executor";
import { Pm2Manager } from "./Pm2Manager";
import { Process } from "../../config/schemas";

describe("Pm2Executor", () => {
  let executor: Pm2Executor;
  const testProjectName = "test-project";
  const testConfigDir = "/test/config/dir";

  beforeEach(() => {
    // Mock all Pm2Manager static methods
    vi.spyOn(Pm2Manager, "startProcessWithTempEcosystem").mockResolvedValue();
    vi.spyOn(Pm2Manager, "deleteAllMatchingProcesses").mockResolvedValue();
    vi.spyOn(Pm2Manager, "restartProcess").mockResolvedValue();
    vi.spyOn(Pm2Manager, "showLogs").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should store projectName and configDir when provided", () => {
      executor = new Pm2Executor(testProjectName, testConfigDir);

      // We can't directly access private properties, but we can verify behavior
      // through the methods that use them
      expect(executor).toBeInstanceOf(Pm2Executor);
    });

    it("should handle undefined projectName and configDir", () => {
      executor = new Pm2Executor();

      expect(executor).toBeInstanceOf(Pm2Executor);
    });

    it("should handle partially undefined parameters", () => {
      executor = new Pm2Executor(testProjectName);

      expect(executor).toBeInstanceOf(Pm2Executor);
    });
  });

  describe("startProcess", () => {
    beforeEach(() => {
      executor = new Pm2Executor(testProjectName, testConfigDir);
    });

    it("should delegate to Pm2Manager.startProcessWithTempEcosystem with correct parameters", async () => {
      const mockProcess: Process = {
        name: "test-service",
        cmd: "echo 'test'",
      };
      const projectName = "override-project";

      await executor.startProcess(mockProcess, projectName);

      expect(Pm2Manager.startProcessWithTempEcosystem).toHaveBeenCalledWith(
        projectName,
        mockProcess,
        testConfigDir,
        undefined,
      );
      expect(Pm2Manager.startProcessWithTempEcosystem).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined configDir when executor was created without it", async () => {
      executor = new Pm2Executor(testProjectName);
      const mockProcess: Process = {
        name: "test-service",
        cmd: "echo 'test'",
      };
      const projectName = "test-project";

      await executor.startProcess(mockProcess, projectName);

      expect(Pm2Manager.startProcessWithTempEcosystem).toHaveBeenCalledWith(
        projectName,
        mockProcess,
        undefined,
        undefined,
      );
    });
  });

  describe("stopProcess", () => {
    beforeEach(() => {
      executor = new Pm2Executor(testProjectName, testConfigDir);
    });

    it("should delegate to Pm2Manager.deleteAllMatchingProcesses with correct parameters", async () => {
      const processName = "test-service";

      await executor.stopProcess(processName);

      expect(Pm2Manager.deleteAllMatchingProcesses).toHaveBeenCalledWith(
        processName,
        testProjectName,
        testConfigDir,
        undefined,
      );
      expect(Pm2Manager.deleteAllMatchingProcesses).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined projectName and configDir when executor was created without them", async () => {
      executor = new Pm2Executor();
      const processName = "test-service";

      await executor.stopProcess(processName);

      expect(Pm2Manager.deleteAllMatchingProcesses).toHaveBeenCalledWith(
        processName,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe("restartProcess", () => {
    beforeEach(() => {
      executor = new Pm2Executor(testProjectName, testConfigDir);
    });

    it("should delegate to Pm2Manager.restartProcess with correct parameters", async () => {
      const processName = "test-service";

      await executor.restartProcess(processName);

      expect(Pm2Manager.restartProcess).toHaveBeenCalledWith(
        processName,
        testProjectName,
        undefined,
      );
      expect(Pm2Manager.restartProcess).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined projectName when executor was created without it", async () => {
      executor = new Pm2Executor();
      const processName = "test-service";

      await executor.restartProcess(processName);

      expect(Pm2Manager.restartProcess).toHaveBeenCalledWith(
        processName,
        undefined,
        undefined,
      );
    });
  });

  describe("showLogs", () => {
    beforeEach(() => {
      executor = new Pm2Executor(testProjectName, testConfigDir);
    });

    it("should delegate to Pm2Manager.showLogs with correct parameters and default follow=false", async () => {
      const processName = "test-service";

      await executor.showLogs(processName);

      expect(Pm2Manager.showLogs).toHaveBeenCalledWith(
        processName,
        testProjectName,
        false,
        testConfigDir,
        undefined,
      );
      expect(Pm2Manager.showLogs).toHaveBeenCalledTimes(1);
    });

    it("should delegate to Pm2Manager.showLogs with follow=true when specified", async () => {
      const processName = "test-service";

      await executor.showLogs(processName, true);

      expect(Pm2Manager.showLogs).toHaveBeenCalledWith(
        processName,
        testProjectName,
        true,
        testConfigDir,
        undefined,
      );
    });

    it("should pass undefined projectName and configDir when executor was created without them", async () => {
      executor = new Pm2Executor();
      const processName = "test-service";

      await executor.showLogs(processName, true);

      expect(Pm2Manager.showLogs).toHaveBeenCalledWith(
        processName,
        undefined,
        true,
        undefined,
        undefined,
      );
    });
  });
});
