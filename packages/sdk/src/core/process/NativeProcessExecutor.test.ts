import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NativeProcessExecutor } from "./NativeProcessExecutor";
import { NativeProcessManager } from "./NativeProcessManager";
import { Process } from "../../config/schemas";

describe("NativeProcessExecutor", () => {
  let executor: NativeProcessExecutor;
  const testProjectName = "test-project";
  const testConfigDir = "/test/config/dir";

  beforeEach(() => {
    // Mock all NativeProcessManager static methods
    vi.spyOn(NativeProcessManager, "startProcessWithTempEcosystem").mockResolvedValue();
    vi.spyOn(NativeProcessManager, "deleteAllMatchingProcesses").mockResolvedValue();
    vi.spyOn(NativeProcessManager, "restartProcess").mockResolvedValue();
    vi.spyOn(NativeProcessManager, "showLogs").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should store projectName and configDir when provided", () => {
      executor = new NativeProcessExecutor(testProjectName, testConfigDir);

      // We can't directly access private properties, but we can verify behavior
      // through the methods that use them
      expect(executor).toBeInstanceOf(NativeProcessExecutor);
    });

    it("should handle undefined projectName and configDir", () => {
      executor = new NativeProcessExecutor();

      expect(executor).toBeInstanceOf(NativeProcessExecutor);
    });

    it("should handle partially undefined parameters", () => {
      executor = new NativeProcessExecutor(testProjectName);

      expect(executor).toBeInstanceOf(NativeProcessExecutor);
    });
  });

  describe("startProcess", () => {
    beforeEach(() => {
      executor = new NativeProcessExecutor(testProjectName, testConfigDir);
    });

    it("should delegate to NativeProcessManager.startProcessWithTempEcosystem with correct parameters", async () => {
      const mockProcess: Process = {
        name: "test-service",
        cmd: "echo 'test'",
      };

      const projectName = "override-project";

      await executor.startProcess(mockProcess, projectName);

      expect(NativeProcessManager.startProcessWithTempEcosystem).toHaveBeenCalledWith(
        projectName,
        mockProcess,
        testConfigDir,
        undefined,
      );

      expect(NativeProcessManager.startProcessWithTempEcosystem).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined configDir when executor was created without it", async () => {
      executor = new NativeProcessExecutor(testProjectName);

      const mockProcess: Process = {
        name: "test-service",
        cmd: "echo 'test'",
      };

      const projectName = "test-project";

      await executor.startProcess(mockProcess, projectName);

      expect(NativeProcessManager.startProcessWithTempEcosystem).toHaveBeenCalledWith(
        projectName,
        mockProcess,
        undefined,
        undefined,
      );
    });
  });

  describe("stopProcess", () => {
    beforeEach(() => {
      executor = new NativeProcessExecutor(testProjectName, testConfigDir);
    });

    it("should delegate to NativeProcessManager.deleteAllMatchingProcesses with correct parameters", async () => {
      const processName = "test-service";

      await executor.stopProcess(processName);

      expect(NativeProcessManager.deleteAllMatchingProcesses).toHaveBeenCalledWith(
        processName,
        testProjectName,
        testConfigDir,
        undefined,
      );

      expect(NativeProcessManager.deleteAllMatchingProcesses).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined projectName and configDir when executor was created without them", async () => {
      executor = new NativeProcessExecutor();
      const processName = "test-service";

      await executor.stopProcess(processName);

      expect(NativeProcessManager.deleteAllMatchingProcesses).toHaveBeenCalledWith(
        processName,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe("restartProcess", () => {
    beforeEach(() => {
      executor = new NativeProcessExecutor(testProjectName, testConfigDir);
    });

    it("should delegate to NativeProcessManager.restartProcess with correct parameters", async () => {
      const processName = "test-service";

      await executor.restartProcess(processName);

      expect(NativeProcessManager.restartProcess).toHaveBeenCalledWith(
        processName,
        testProjectName,
        undefined,
      );

      expect(NativeProcessManager.restartProcess).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined projectName when executor was created without it", async () => {
      executor = new NativeProcessExecutor();
      const processName = "test-service";

      await executor.restartProcess(processName);

      expect(NativeProcessManager.restartProcess).toHaveBeenCalledWith(
        processName,
        undefined,
        undefined,
      );
    });
  });

  describe("showLogs", () => {
    beforeEach(() => {
      executor = new NativeProcessExecutor(testProjectName, testConfigDir);
    });

    it("should delegate to NativeProcessManager.showLogs with correct parameters and default follow=false", async () => {
      const processName = "test-service";

      await executor.showLogs(processName);

      expect(NativeProcessManager.showLogs).toHaveBeenCalledWith(
        processName,
        testProjectName,
        false,
        testConfigDir,
        undefined,
      );

      expect(NativeProcessManager.showLogs).toHaveBeenCalledTimes(1);
    });

    it("should delegate to NativeProcessManager.showLogs with follow=true when specified", async () => {
      const processName = "test-service";

      await executor.showLogs(processName, true);

      expect(NativeProcessManager.showLogs).toHaveBeenCalledWith(
        processName,
        testProjectName,
        true,
        testConfigDir,
        undefined,
      );
    });

    it("should pass undefined projectName and configDir when executor was created without them", async () => {
      executor = new NativeProcessExecutor();
      const processName = "test-service";

      await executor.showLogs(processName, true);

      expect(NativeProcessManager.showLogs).toHaveBeenCalledWith(
        processName,
        undefined,
        true,
        undefined,
        undefined,
      );
    });
  });
});
