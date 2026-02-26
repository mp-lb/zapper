import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Path to built CLI
const CLI_PATH = path.join(__dirname, "../../dist/index.js");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Utility function to run CLI commands
function runZapCommand(
  command: string,
  cwd: string,
  options: { timeout?: number; encoding?: BufferEncoding } = {},
) {
  const { timeout = 10000, encoding = "utf8" } = options;
  try {
    return execSync(`node "${CLI_PATH}" ${command}`, {
      cwd,
      timeout,
      encoding,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error: unknown) {
    // Include stderr in error for better debugging
    if (error && typeof error === "object" && "stderr" in error) {
      const execError = error as { stderr?: Buffer | string; message?: string };
      if (execError.stderr) {
        const message = execError.message || "";
        (error as { message: string }).message =
          message + `\nStderr: ${execError.stderr.toString()}`;
      }
    }
    throw error;
  }
}

// Utility function to generate unique project names
function generateTestProjectName(): string {
  return `e2e-env-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Utility function to clean up PM2 processes
async function cleanupPm2Processes(projectName: string) {
  try {
    // Delete all processes matching the project pattern
    execSync(`pm2 delete "zap.${projectName}.*" 2>/dev/null || true`, {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch (error) {
    // Ignore cleanup errors - processes might not exist
  }
}

// Utility function to read state file if it exists
function readStateFile(fixtureDir: string): Record<string, unknown> | null {
  const statePath = path.join(fixtureDir, ".zap", "state.json");
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  }
  return null;
}

// Utility function to wait for expected values in the service log file
function waitForLogValues(
  fixtureDir: string,
  projectName: string,
  expectedValues: string[],
  timeout = 12000,
): string {
  const logPath = path.join(
    fixtureDir,
    ".zap",
    "logs",
    `${projectName}.echo-service.log`,
  );
  const startTime = Date.now();
  let lastOutput = "";

  while (Date.now() - startTime < timeout) {
    try {
      if (fs.existsSync(logPath)) {
        const output = fs.readFileSync(logPath, "utf8");
        lastOutput = output;

        const hasAllValues = expectedValues.every((value) =>
          output.includes(value),
        );
        if (hasAllValues) {
          return output;
        }
      }
    } catch (error) {
      // Continue trying - log file may not be ready yet
    }

    // Wait a bit before checking again
    execSync("sleep 1", { stdio: "ignore" });
  }

  return lastOutput;
}

describe("E2E: Environment Sets and State Persistence", () => {
  let testProjectName: string;
  let fixtureDir: string;
  let tempConfigPath: string;

  beforeAll(() => {
    // Ensure CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
  });

  afterAll(async () => {
    // Cleanup any remaining test processes for this suite only
    try {
      const output = execSync("pm2 jlist --silent", {
        encoding: "utf8",
        timeout: 5000,
      });
      const processes = JSON.parse(output);
      for (const proc of processes) {
        if (proc.name?.startsWith("zap.e2e-env-test-")) {
          execSync(`pm2 delete "${proc.name}" 2>/dev/null || true`, {
            stdio: "ignore",
            timeout: 5000,
          });
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    // Cleanup after each test
    if (testProjectName) {
      await cleanupPm2Processes(testProjectName);
    }

    // Remove temp config file
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }

    // Clean up .zap directory if it exists
    const zapDir = path.join(fixtureDir, ".zap");
    if (fs.existsSync(zapDir)) {
      fs.rmSync(zapDir, { recursive: true, force: true });
    }
  });

  it("should switch environments and persist state correctly", async () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "env-switching");

    // Create temp config with unique project name
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const uniqueConfig = originalConfig.replace(
      "project: env-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    // Ensure clean state before test
    const zapDir = path.join(fixtureDir, ".zap");
    if (fs.existsSync(zapDir)) {
      fs.rmSync(zapDir, { recursive: true, force: true });
    }

    try {
      // Test 1: Start with default environment
      const upOutput = runZapCommand(
        `up --config zap-${testProjectName}.yaml`,
        fixtureDir,
        { timeout: 15000 },
      );
      expect(upOutput).toContain("echo-service");

      // Wait for process to start and capture logs to verify default environment
      const logsWithDefault = waitForLogValues(fixtureDir, testProjectName, [
        "TEST_VALUE=default_value",
        "NODE_ENV=development",
      ]);
      expect(logsWithDefault).toContain("TEST_VALUE=default_value");
      expect(logsWithDefault).toContain("NODE_ENV=development");

      // Test 2: Stop processes
      const downOutput = runZapCommand(
        `down --config zap-${testProjectName}.yaml`,
        fixtureDir,
        { timeout: 15000 },
      );
      expect(downOutput).toContain("echo-service") ||
        expect(downOutput).toContain("Stopping");

      // Wait for processes to fully stop
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test 3: Switch to alternate environment
      const envSwitchOutput = runZapCommand(
        `env alternate --config zap-${testProjectName}.yaml`,
        fixtureDir,
      );
      expect(envSwitchOutput).toContain("alternate") ||
        expect(envSwitchOutput).toContain("environment");

      // Test 4: Verify state file was created and contains correct environment
      const stateAfterSwitch = readStateFile(fixtureDir);
      expect(stateAfterSwitch).not.toBeNull();
      expect(stateAfterSwitch.activeEnvironment).toBe("alternate");

      // Test 5: Start with alternate environment
      const upAlternateOutput = runZapCommand(
        `up --config zap-${testProjectName}.yaml`,
        fixtureDir,
        { timeout: 15000 },
      );
      expect(upAlternateOutput).toContain("echo-service");

      // Wait for process to start and capture logs to verify alternate environment
      const logsWithAlternate = waitForLogValues(fixtureDir, testProjectName, [
        "TEST_VALUE=alternate_value",
        "NODE_ENV=staging",
      ]);
      expect(logsWithAlternate).toContain("TEST_VALUE=alternate_value");
      expect(logsWithAlternate).toContain("NODE_ENV=staging");

      // Test 6: Stop processes again
      runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
        timeout: 15000,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test 7: Disable environment (reset to default)
      const envDisableOutput = runZapCommand(
        `env --disable --config zap-${testProjectName}.yaml`,
        fixtureDir,
      );
      expect(envDisableOutput).toMatch(/disabled|reset|default/i) ||
        expect(envDisableOutput).toMatch(/environment/);

      // Test 8: Verify state file reflects the change
      const stateAfterDisable = readStateFile(fixtureDir);
      expect(stateAfterDisable).toBeDefined();
      expect([null, undefined, "default"]).toContain(
        stateAfterDisable.activeEnvironment,
      );

      // Test 9: Start again and verify we're back to default
      runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
        timeout: 15000,
      });

      const logsBackToDefault = waitForLogValues(fixtureDir, testProjectName, [
        "TEST_VALUE=default_value",
        "NODE_ENV=development",
      ]);
      expect(logsBackToDefault).toContain("TEST_VALUE=default_value");
      expect(logsBackToDefault).toContain("NODE_ENV=development");

      // Test 10: Stop and test `zap state` command
      runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
        timeout: 15000,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const stateOutput = runZapCommand(
        `state --config zap-${testProjectName}.yaml`,
        fixtureDir,
      );

      // Should output valid JSON
      expect(() => {
        const parsedState = JSON.parse(stateOutput);
        expect(typeof parsedState).toBe("object");
        // Note: activeEnvironment property is optional and may not exist when disabled
      }).not.toThrow();

      const finalState = JSON.parse(stateOutput);
      expect([null, undefined, "default"]).toContain(
        finalState.activeEnvironment,
      );
    } finally {
      // Ensure cleanup happens
      await cleanupPm2Processes(testProjectName);
    }
  }, 45000); // 45 second timeout for comprehensive test

  it("should handle environment switching with non-existent environment gracefully", async () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "env-switching");

    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const uniqueConfig = originalConfig.replace(
      "project: env-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    // Try to switch to a non-existent environment
    expect(() => {
      runZapCommand(
        `env nonexistent --config zap-${testProjectName}.yaml`,
        fixtureDir,
      );
    }).toThrow(); // Should fail gracefully

    // State file should either not exist or not be corrupted
    const state = readStateFile(fixtureDir);
    if (state !== null) {
      expect(() => JSON.stringify(state)).not.toThrow();
    }
  });

  it("should maintain environment selection across multiple up/down cycles", async () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "env-switching");

    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const uniqueConfig = originalConfig.replace(
      "project: env-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    try {
      // Set alternate environment
      runZapCommand(
        `env alternate --config zap-${testProjectName}.yaml`,
        fixtureDir,
      );

      // Multiple up/down cycles
      for (let i = 0; i < 3; i++) {
        // Start
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });

        // Quick log check
        const logs = waitForLogValues(
          fixtureDir,
          testProjectName,
          ["TEST_VALUE=alternate_value"],
          8000,
        );
        expect(logs).toContain("TEST_VALUE=alternate_value");

        // Stop
        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify state persists
        const state = readStateFile(fixtureDir);
        expect(state.activeEnvironment).toBe("alternate");
      }
    } finally {
      await cleanupPm2Processes(testProjectName);
    }
  }, 30000);
});
