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
  return `e2e-aliases-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

describe("E2E: Aliases Support", () => {
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
    // Cleanup any remaining test processes (only zap.e2e-aliases-test-* patterns)
    try {
      const output = execSync("pm2 jlist --silent", {
        encoding: "utf8",
        timeout: 5000,
      });
      const processes = JSON.parse(output);
      for (const proc of processes) {
        if (proc.name?.startsWith("zap.e2e-aliases-test-")) {
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
    // Cleanup temp config file
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  describe("Service Aliases", () => {
    it("should start services using aliases", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      // Create temp config with unique project name
      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start all services
        const upOutput = runZapCommand(
          `up --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(upOutput).toContain("webserver");
        expect(upOutput).toContain("background-worker");
        expect(upOutput).toContain("database");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify all processes are running with correct names
        const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
        const pm2Processes = JSON.parse(pm2ListOutput);
        const zapProcesses = pm2Processes.filter((proc: { name: string }) =>
          proc.name?.startsWith(`zap.${testProjectName}.`),
        );

        expect(zapProcesses.length).toBe(3); // webserver + background-worker + database

        const processNames = zapProcesses.map(
          (proc: { name: string }) => proc.name,
        );
        expect(processNames).toContain(`zap.${testProjectName}.webserver`);
        expect(processNames).toContain(
          `zap.${testProjectName}.background-worker`,
        );
        expect(processNames).toContain(`zap.${testProjectName}.database`);

        // Test status shows all services
        const statusOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusOutput).toContain("webserver");
        expect(statusOutput).toContain("background-worker");
        expect(statusOutput).toContain("database");
      } finally {
        // Stop all services
        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
      }
    }, 30000);

    it("should get logs using service aliases", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start services
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Test logs command with various aliases
        // Test 'web' alias for 'webserver'
        const webLogsOutput = runZapCommand(
          `logs web --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(webLogsOutput).toContain("WebServer");

        // Test 'server' alias for 'webserver'
        const serverLogsOutput = runZapCommand(
          `logs server --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(serverLogsOutput).toContain("WebServer");

        // Test 's' alias for 'webserver'
        const sLogsOutput = runZapCommand(
          `logs s --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(sLogsOutput).toContain("WebServer");

        // Test 'worker' alias for 'background-worker'
        const workerLogsOutput = runZapCommand(
          `logs worker --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(workerLogsOutput).toContain("Background Worker");

        // Test 'bg' alias for 'background-worker'
        const bgLogsOutput = runZapCommand(
          `logs bg --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(bgLogsOutput).toContain("Background Worker");

        // Test 'w' alias for 'background-worker'
        const wLogsOutput = runZapCommand(
          `logs w --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(wLogsOutput).toContain("Background Worker");

        // Test 'db' alias for 'database'
        const dbLogsOutput = runZapCommand(
          `logs db --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(dbLogsOutput).toContain("Database");

        // Test 'postgres' alias for 'database'
        const pgLogsOutput = runZapCommand(
          `logs postgres --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(pgLogsOutput).toContain("Database");

        // Test 'pg' alias for 'database'
        const postgresLogsOutput = runZapCommand(
          `logs pg --no-follow --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 5000 },
        );
        expect(postgresLogsOutput).toContain("Database");
      } finally {
        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
      }
    }, 40000);

    it("should restart services using aliases", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start services
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Get initial PM2 process info
        let pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
        let pm2Processes = JSON.parse(pm2ListOutput);
        let webProcess = pm2Processes.find(
          (proc: { name: string }) =>
            proc.name === `zap.${testProjectName}.webserver`,
        );
        const initialWebPid = webProcess?.pid;

        // Restart using 'r' command shorthand and 'web' service alias
        const restartOutput = runZapCommand(
          `r web --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(restartOutput).toContain("webserver"); // Should show canonical name in output

        // Wait for the restarted process to come back online
        let newWebPid: number | undefined;
        const startTime = Date.now();
        while (Date.now() - startTime < 10000) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
          pm2Processes = JSON.parse(pm2ListOutput);
          webProcess = pm2Processes.find(
            (proc: { name: string; pm2_env?: { status: string } }) =>
              proc.name === `zap.${testProjectName}.webserver` &&
              proc.pm2_env?.status === "online",
          );
          if (webProcess?.pid) {
            newWebPid = webProcess.pid;
            break;
          }
        }

        expect(newWebPid).toBeDefined();
        expect(newWebPid).not.toBe(initialWebPid);
      } finally {
        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
      }
    }, 45000);

    it("should stop services using aliases", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start services
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Stop specific services using aliases
        const downWebOutput = runZapCommand(
          `down web --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(downWebOutput).toContain("webserver");

        const downWorkerOutput = runZapCommand(
          `down bg --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(downWorkerOutput).toContain("background-worker");

        const downDbOutput = runZapCommand(
          `down pg --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(downDbOutput).toContain("database");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify all processes are stopped
        const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
        const pm2Processes = JSON.parse(pm2ListOutput);
        const zapProcesses = pm2Processes.filter((proc: { name: string }) =>
          proc.name?.startsWith(`zap.${testProjectName}.`),
        );
        expect(zapProcesses.length).toBe(0);
      } finally {
        // Ensure cleanup
        await cleanupPm2Processes(testProjectName);
      }
    }, 30000);
  });

  describe("Task Aliases", () => {
    it("should execute tasks using aliases", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Test 'b' alias for 'build' task
        const buildOutput = runZapCommand(
          `task b --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(buildOutput).toContain("Building frontend");
        expect(buildOutput).toContain("Building backend");
        expect(buildOutput).toContain("Build completed successfully");

        // Test 'run' alias for task command
        const runOutput = runZapCommand(
          `run b --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(runOutput).toContain("Building frontend");
        expect(runOutput).toContain("Build completed successfully");

        // Test 'compile' alias for 'build' task
        const compileOutput = runZapCommand(
          `task compile --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(compileOutput).toContain("Building frontend");
        expect(compileOutput).toContain("Build completed successfully");

        // Test 't' alias for 'test' task
        const testOutput = runZapCommand(
          `task t --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(testOutput).toContain("Running unit tests");
        expect(testOutput).toContain("Running integration tests");
        expect(testOutput).toContain("Building frontend"); // Should run build task
        expect(testOutput).toContain("All tests passed");

        // Test 'tests' alias for 'test' task
        const testsOutput = runZapCommand(
          `task tests --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(testsOutput).toContain("Running unit tests");
        expect(testsOutput).toContain("All tests passed");

        // Test 'check' alias for 'test' task
        const checkOutput = runZapCommand(
          `task check --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 15000 },
        );
        expect(checkOutput).toContain("Running unit tests");
        expect(checkOutput).toContain("All tests passed");

        // Test 'd' alias for 'deploy' task
        const deployOutput = runZapCommand(
          `task d --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 20000 },
        );
        expect(deployOutput).toContain("Running unit tests"); // Should run test task
        expect(deployOutput).toContain("Building frontend"); // Should run build task (via test)
        expect(deployOutput).toContain("Deploying to staging");
        expect(deployOutput).toContain("Deploying to production");
        expect(deployOutput).toContain("Deployment completed");

        // Test 'prod' alias for 'deploy' task
        const prodOutput = runZapCommand(
          `task prod --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 20000 },
        );
        expect(prodOutput).toContain("Deploying to production");
        expect(prodOutput).toContain("Deployment completed");

        // Test 'production' alias for 'deploy' task
        const productionOutput = runZapCommand(
          `task production --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 20000 },
        );
        expect(productionOutput).toContain("Deploying to production");
        expect(productionOutput).toContain("Deployment completed");

        // Test 'start' alias for 'start-services' task
        const startOutput = runZapCommand(
          `task start --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(startOutput).toContain("Starting database service");
        expect(startOutput).toContain("Starting web server");
        expect(startOutput).toContain("Starting background worker");
        expect(startOutput).toContain("All services started");

        // Test 'up' alias for 'start-services' task
        const upTaskOutput = runZapCommand(
          `task up --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(upTaskOutput).toContain("Starting database service");
        expect(upTaskOutput).toContain("All services started");

        // Test 'services' alias for 'start-services' task
        const servicesOutput = runZapCommand(
          `task services --config zap-${testProjectName}.yaml`,
          fixtureDir,
          { timeout: 10000 },
        );
        expect(servicesOutput).toContain("Starting database service");
        expect(servicesOutput).toContain("All services started");
      } finally {
        // No PM2 cleanup needed for task commands
      }
    }, 60000);
  });

  describe("Error Handling with Aliases", () => {
    it("should show error for non-existent alias", () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Try to get logs for non-existent service alias
        expect(() => {
          runZapCommand(
            `logs nonexistent --config zap-${testProjectName}.yaml`,
            fixtureDir,
          );
        }).toThrow();

        // Try to run non-existent task alias
        expect(() => {
          runZapCommand(
            `task nonexistent --config zap-${testProjectName}.yaml`,
            fixtureDir,
          );
        }).toThrow();
      } finally {
        // No cleanup needed for error cases
      }
    });

    it("should handle status command correctly with aliases in output", async () => {
      testProjectName = generateTestProjectName();
      fixtureDir = path.join(FIXTURES_DIR, "aliases-project");

      tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
      const originalConfig = fs.readFileSync(
        path.join(fixtureDir, "zap.yaml"),
        "utf8",
      );
      const uniqueConfig = originalConfig.replace(
        "project: aliases-test",
        `project: ${testProjectName}`,
      );
      fs.writeFileSync(tempConfigPath, uniqueConfig);

      try {
        // Start services
        runZapCommand(`up --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check status shows canonical names (not aliases)
        const statusOutput = runZapCommand(
          `status --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        expect(statusOutput).toContain("webserver");
        expect(statusOutput).toContain("background-worker");
        expect(statusOutput).toContain("database");

        // Status JSON output should also show canonical names
        const statusJsonOutput = runZapCommand(
          `status --json --config zap-${testProjectName}.yaml`,
          fixtureDir,
        );
        const statusData = JSON.parse(statusJsonOutput);
        expect(statusData).toBeDefined();

        // Find the services in the status data (structure may vary)
        const statusText = JSON.stringify(statusData);
        expect(statusText).toContain("webserver");
        expect(statusText).toContain("background-worker");
        expect(statusText).toContain("database");
      } finally {
        runZapCommand(`down --config zap-${testProjectName}.yaml`, fixtureDir, {
          timeout: 15000,
        });
      }
    }, 25000);
  });
});
