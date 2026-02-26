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

function stripAnsi(text: string): string {
  const ansiCodes = [
    "\u001B[0m",
    "\u001B[31m",
    "\u001B[32m",
    "\u001B[33m",
    "\u001B[37m",
    "\u001B[90m",
  ];
  return ansiCodes.reduce((output, code) => output.split(code).join(""), text);
}

function normalizeOutput(text: string): string {
  return stripAnsi(text).replace(/\r\n/g, "\n").trim();
}

// Utility function to generate unique project names
function generateTestProjectName(): string {
  return `e2e-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

describe("E2E: Simple Project Flow", () => {
  let testProjectName: string;
  let fixtureDir: string;

  beforeAll(() => {
    // Ensure CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
  });

  afterAll(async () => {
    // Cleanup any remaining test processes (only zap.e2e-test-* patterns)
    try {
      const output = execSync("pm2 jlist --silent", {
        encoding: "utf8",
        timeout: 5000,
      });
      const processes = JSON.parse(output);
      for (const proc of processes) {
        if (proc.name?.startsWith("zap.e2e-test-")) {
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
  });

  describe("Basic CLI Operations", () => {
    it("should start, status, logs, and stop processes correctly", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "simple-project");

      // Create temp config with unique project name
      const tempConfigPath = path.join(
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: simple-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Test: zap up
        const upOutput = runZapCommand(
          `up --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(upOutput).toContain("server"); // Should mention the services being started
        expect(upOutput).toContain("worker");

        // Wait a bit for processes to fully start
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Test: zap status (human readable)
        const statusOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusOutput).toContain("server");
        expect(statusOutput).toContain("worker");

        // Test: zap status --json (machine readable)
        const statusJsonOutput = runZapCommand(
          `status --json --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        const statusData = JSON.parse(statusJsonOutput);
        expect(statusData).toBeDefined();
        expect(
          Array.isArray(statusData) || typeof statusData === "object",
        ).toBe(true);

        // Verify PM2 process names follow zap.{project}.{service} convention
        const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
        const pm2Processes = JSON.parse(pm2ListOutput);

        const zapProcesses = pm2Processes.filter((proc: { name: string }) =>
          proc.name?.startsWith(`zap.${testProjectName}.`),
        );

        expect(zapProcesses.length).toBe(2); // server + worker

        const processNames = zapProcesses.map(
          (proc: { name: string }) => proc.name,
        );
        expect(processNames).toContain(`zap.${testProjectName}.server`);
        expect(processNames).toContain(`zap.${testProjectName}.worker`);

        // Test: zap logs for a specific service (logs requires a service argument)
        const logsOutput = runZapCommand(
          `logs server --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(logsOutput).toContain("Server"); // Should contain output from our process

        // Test: zap down
        const downOutput = runZapCommand(
          `down --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(downOutput).toContain("server");
        expect(downOutput).toContain("worker");

        // Wait a bit for processes to fully stop
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Test: zap status after down (should show services as down)
        const statusAfterDownOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusAfterDownOutput).toContain("down");

        // Verify processes are actually gone from PM2
        const pm2ListAfterDown = execSync("pm2 jlist", { encoding: "utf8" });
        const pm2ProcessesAfterDown = JSON.parse(pm2ListAfterDown);
        const zapProcessesAfterDown = pm2ProcessesAfterDown.filter(
          (proc: { name: string }) =>
            proc.name?.startsWith(`zap.${testProjectName}.`),
        );
        expect(zapProcessesAfterDown.length).toBe(0);
      } finally {
        // Cleanup temp config
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath);
        }
      }
    }, 30000); // 30 second timeout for full test

    it("should keep ps output aligned with status output", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "simple-project");

      const tempConfigPath = path.join(
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: simple-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusOutput = normalizeOutput(
          runZapCommand(
            `status --config zap-${testProjectName}.yaml`,
            fixtureDir,
          ),
        );
        const psOutput = normalizeOutput(
          runZapCommand(`ps --config zap-${testProjectName}.yaml`, fixtureDir),
        );
        expect(psOutput).toBe(statusOutput);
        expect(statusOutput).toContain(testProjectName);
        expect(statusOutput).toContain("Native");
        expect(statusOutput).toContain("server");
        expect(statusOutput).toContain("worker");

        const statusJson = JSON.parse(
          runZapCommand(
            `status --json --config zap-${testProjectName}.yaml`,
            fixtureDir,
          ),
        );
        const psJson = JSON.parse(
          runZapCommand(
            `ps --json --config zap-${testProjectName}.yaml`,
            fixtureDir,
          ),
        );
        expect(psJson).toEqual(statusJson);

        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusAfterDown = normalizeOutput(
          runZapCommand(
            `status --config zap-${testProjectName}.yaml`,
            fixtureDir,
          ),
        );
        const psAfterDown = normalizeOutput(
          runZapCommand(`ps --config zap-${testProjectName}.yaml`, fixtureDir),
        );
        expect(psAfterDown).toBe(statusAfterDown);
        expect(statusAfterDown).toContain("down");
      } finally {
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath);
        }
      }
    }, 30000);

    it("should handle minimal project with single service", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "minimal-project");

      // Create temp config with unique project name
      const tempConfigPath = path.join(
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: minimal-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start the minimal project
        const upOutput = runZapCommand(
          `up --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(upOutput).toContain("app");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check status
        const statusOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusOutput).toContain("app");

        // Verify correct PM2 process name
        const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
        const pm2Processes = JSON.parse(pm2ListOutput);
        const zapProcess = pm2Processes.find(
          (proc: { name: string }) =>
            proc.name === `zap.${testProjectName}.app`,
        );
        expect(zapProcess).toBeDefined();

        // Stop the project
        const downOutput = runZapCommand(
          `down --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(downOutput).toContain("app");
      } finally {
        // Cleanup temp config
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath);
        }
      }
    }, 20000); // 20 second timeout
  });

  describe("Error Handling", () => {
    it("should handle invalid config file gracefully", () => {
      expect(() => {
        runZapCommand("status --config nonexistent.yaml", FIXTURES_DIR);
      }).toThrow();
    });

    it("should handle status command when no processes are running", () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "minimal-project");

      const tempConfigPath = path.join(
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: minimal-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Status should work even with no running processes
        const statusOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusOutput).toContain("down");
      } finally {
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath);
        }
      }
    });
  });
});
