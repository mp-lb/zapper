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
  configFile: string,
  options: { timeout?: number; encoding?: BufferEncoding } = {},
) {
  const { timeout = 15000, encoding = "utf8" } = options;
  try {
    return execSync(`node "${CLI_PATH}" --config ${configFile} ${command}`, {
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
  return `e2e-multi-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

// Utility function to wait for services to be healthy
async function waitForServices(
  projectName: string,
  expectedServices: string[],
  maxWaitMs = 30000,
) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
      const pm2Processes = JSON.parse(pm2ListOutput);

      const zapProcesses = pm2Processes.filter(
        (proc: { name: string }) =>
          proc.name?.startsWith(`zap.${projectName}.`) &&
          expectedServices.some(
            (service) => proc.name === `zap.${projectName}.${service}`,
          ),
      );

      const runningServices = zapProcesses
        .filter((proc: { name: string }) => proc.pm2_env?.status === "online")
        .map((proc: { name: string }) => proc.name.split(".").pop());

      if (runningServices.length === expectedServices.length) {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// Utility function to get running service names for a project
function getRunningServices(projectName: string): string[] {
  try {
    const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
    const pm2Processes = JSON.parse(pm2ListOutput);

    return pm2Processes
      .filter(
        (proc: { name: string }) =>
          proc.name?.startsWith(`zap.${projectName}.`) &&
          proc.pm2_env?.status === "online",
      )
      .map((proc: { name: string }) => proc.name.split(".").pop());
  } catch (error) {
    return [];
  }
}

describe("E2E: Multi-Service Project with Dependencies and Profiles", () => {
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
    fixtureDir = path.join(FIXTURES_DIR, "multi-service");
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
        if (proc.name?.startsWith("zap.e2e-multi-test-")) {
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
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      // Disable any active profiles before cleanup
      try {
        runZapCommand(
          `profile --disable`,
          fixtureDir,
          `zap-${testProjectName}.yaml`,
        );
      } catch (error) {
        // Ignore profile cleanup errors
      }
      fs.unlinkSync(tempConfigPath);
    }
  });

  function setupTempConfig(options?: { stripProfiles?: boolean }) {
    testProjectName = generateTestProjectName();
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    let uniqueConfig = originalConfig.replace(
      "project: multi-service-test",
      `project: ${testProjectName}`,
    );
    if (options?.stripProfiles) {
      uniqueConfig = uniqueConfig.replace(/\n\s+profiles:\s+\[[^\]]+\]/g, "");
    }
    fs.writeFileSync(tempConfigPath, uniqueConfig);
  }

  describe("Dependency Ordering", () => {
    it("should start all services in dependency order with 'zap up'", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start all services
      const upOutput = runZapCommand(
        `up`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
        { timeout: 30000 },
      );

      // Should mention all services
      expect(upOutput).toContain("database");
      expect(upOutput).toContain("api");
      expect(upOutput).toContain("frontend");
      expect(upOutput).toContain("worker");

      // Wait for services to be healthy
      const isHealthy = await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);
      expect(isHealthy).toBe(true);

      // Verify all services are running
      const runningServices = getRunningServices(testProjectName);
      expect(runningServices.sort()).toEqual(
        ["database", "api", "frontend", "worker"].sort(),
      );

      // Verify PM2 process names follow convention
      const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
      const pm2Processes = JSON.parse(pm2ListOutput);
      const zapProcesses = pm2Processes.filter((proc: { name: string }) =>
        proc.name?.startsWith(`zap.${testProjectName}.`),
      );

      expect(zapProcesses.length).toBe(4);
      const processNames = zapProcesses.map(
        (proc: { name: string }) => proc.name,
      );
      expect(processNames).toContain(`zap.${testProjectName}.database`);
      expect(processNames).toContain(`zap.${testProjectName}.api`);
      expect(processNames).toContain(`zap.${testProjectName}.frontend`);
      expect(processNames).toContain(`zap.${testProjectName}.worker`);
    }, 45000);

    it("should show all services in 'zap status'", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start services first
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });
      await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);

      // Check status
      const statusOutput = runZapCommand(
        `status`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );

      expect(statusOutput).toContain("database");
      expect(statusOutput).toContain("api");
      expect(statusOutput).toContain("frontend");
      expect(statusOutput).toContain("worker");
      expect(statusOutput).toMatch(/up|running|online/);

      // Check JSON status
      const statusJsonOutput = runZapCommand(
        `status --json`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      const statusData = JSON.parse(statusJsonOutput);
      expect(statusData).toBeDefined();
      expect(Array.isArray(statusData) || typeof statusData === "object").toBe(
        true,
      );
    }, 45000);
  });

  describe("Selective Service Operations", () => {
    it("should start only specified service and its dependencies with 'zap up <name>'", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start only frontend (should start database, api, and frontend due to dependencies)
      runZapCommand(`up frontend`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });

      // Wait for dependent services to start
      await waitForServices(testProjectName, ["database", "api", "frontend"]);

      const runningServices = getRunningServices(testProjectName);

      // Should have database, api, and frontend (frontend's dependencies)
      expect(runningServices).toContain("database");
      expect(runningServices).toContain("api");
      expect(runningServices).toContain("frontend");

      // Should NOT have worker (not a dependency of frontend)
      expect(runningServices).not.toContain("worker");
      expect(runningServices.length).toBe(3);
    }, 45000);

    it("should stop only specified service with 'zap down <name>'", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start all services first
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });
      await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);

      // Stop only the frontend service
      const downOutput = runZapCommand(
        `down frontend`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      expect(downOutput).toContain("frontend");

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const runningServices = getRunningServices(testProjectName);

      // Frontend should be stopped
      expect(runningServices).not.toContain("frontend");

      // Other services should still be running
      expect(runningServices).toContain("database");
      expect(runningServices).toContain("api");
      expect(runningServices).toContain("worker");
    }, 45000);

    it("should restart specified service correctly with 'zap restart <name>'", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start all services first
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });
      await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);

      // Get initial process info for api service
      const initialPm2List = execSync("pm2 jlist", { encoding: "utf8" });
      const initialProcesses = JSON.parse(initialPm2List);
      const initialApiProcess = initialProcesses.find(
        (proc: { name: string }) => proc.name === `zap.${testProjectName}.api`,
      );
      expect(initialApiProcess).toBeDefined();
      const initialPid = initialApiProcess.pid;

      // Restart the api service
      const restartOutput = runZapCommand(
        `restart api`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
        { timeout: 30000 },
      );
      expect(restartOutput).toContain("api");

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify service is still running but with new PID
      const afterRestartPm2List = execSync("pm2 jlist", { encoding: "utf8" });
      const afterRestartProcesses = JSON.parse(afterRestartPm2List);
      const restartedApiProcess = afterRestartProcesses.find(
        (proc: { name: string }) => proc.name === `zap.${testProjectName}.api`,
      );

      expect(restartedApiProcess).toBeDefined();
      expect(restartedApiProcess.pm2_env.status).toBe("online");
      expect(restartedApiProcess.pid).not.toBe(initialPid); // Should have new PID

      // Other services should still be running and unchanged
      const runningServices = getRunningServices(testProjectName);
      expect(runningServices.sort()).toEqual(
        ["database", "api", "frontend", "worker"].sort(),
      );
    }, 45000);
  });

  describe("Profile Filtering", () => {
    it("should start only dev-profiled services with profile management", async () => {
      setupTempConfig();

      // Enable dev profile first
      runZapCommand(`profile dev`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 45000,
      });

      // Start services (should only start dev-profiled ones)
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });

      // Wait for dev services to start (database, api, frontend)
      await waitForServices(testProjectName, ["database", "api", "frontend"]);

      const runningServices = getRunningServices(testProjectName);

      // Should have dev profile services: database, api, frontend
      expect(runningServices).toContain("database");
      expect(runningServices).toContain("api");
      expect(runningServices).toContain("frontend");

      // Should NOT have worker (prod profile only)
      expect(runningServices).not.toContain("worker");
      expect(runningServices.length).toBe(3);
    }, 45000);

    it("should start only prod-profiled services with profile management", async () => {
      setupTempConfig();

      // Enable prod profile first
      runZapCommand(`profile prod`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 45000,
      });

      // Start services (should only start prod-profiled ones)
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });

      // Wait for prod services to start (database, api, worker)
      await waitForServices(testProjectName, ["database", "api", "worker"]);

      const runningServices = getRunningServices(testProjectName);

      // Should have prod profile services: database, api, worker
      expect(runningServices).toContain("database");
      expect(runningServices).toContain("api");
      expect(runningServices).toContain("worker");

      // Should NOT have frontend (dev profile only)
      expect(runningServices).not.toContain("frontend");
      expect(runningServices.length).toBe(3);
    }, 45000);
  });

  describe("Complete Lifecycle", () => {
    it("should handle complete up -> status -> down lifecycle", async () => {
      setupTempConfig({ stripProfiles: true });

      // 1. Start all services
      const upOutput = runZapCommand(
        `up`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
        { timeout: 30000 },
      );
      expect(upOutput).toContain("database");
      expect(upOutput).toContain("api");
      expect(upOutput).toContain("frontend");
      expect(upOutput).toContain("worker");

      // Wait for all services to be healthy
      const isHealthy = await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);
      expect(isHealthy).toBe(true);

      // 2. Check status shows all running
      const statusOutput = runZapCommand(
        `status`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      expect(statusOutput).toContain("database");
      expect(statusOutput).toContain("api");
      expect(statusOutput).toContain("frontend");
      expect(statusOutput).toContain("worker");
      expect(statusOutput).toMatch(/up|running|online/);

      // 3. Stop all services
      const downOutput = runZapCommand(
        `down`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
        { timeout: 20000 },
      );
      expect(downOutput).toMatch(/database|api|frontend|worker|Stopping/);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 4. Verify all services are stopped
      const runningServices = getRunningServices(testProjectName);
      expect(runningServices.length).toBe(0);

      // 5. Status should show no running processes
      const statusAfterDown = runZapCommand(
        `status`,
        fixtureDir,
        `zap-${testProjectName}.yaml`,
      );
      expect(statusAfterDown).toMatch(
        /stopped|not running|offline|No processes|down/i,
      );

      // 6. Verify processes are completely gone from PM2
      const pm2ListAfterDown = execSync("pm2 jlist", { encoding: "utf8" });
      const pm2ProcessesAfterDown = JSON.parse(pm2ListAfterDown);
      const zapProcessesAfterDown = pm2ProcessesAfterDown.filter(
        (proc: { name: string }) =>
          proc.name?.startsWith(`zap.${testProjectName}.`),
      );
      expect(zapProcessesAfterDown.length).toBe(0);
    }, 60000);
  });

  describe("Naming Convention Validation", () => {
    it("should follow zap.{project}.{service} naming convention consistently", async () => {
      setupTempConfig({ stripProfiles: true });

      // Start services
      runZapCommand(`up`, fixtureDir, `zap-${testProjectName}.yaml`, {
        timeout: 30000,
      });
      await waitForServices(testProjectName, [
        "database",
        "api",
        "frontend",
        "worker",
      ]);

      // Verify naming convention
      const pm2ListOutput = execSync("pm2 jlist", { encoding: "utf8" });
      const pm2Processes = JSON.parse(pm2ListOutput);

      const zapProcesses = pm2Processes.filter((proc: { name: string }) =>
        proc.name?.startsWith(`zap.${testProjectName}.`),
      );

      // Should have exactly 4 processes
      expect(zapProcesses.length).toBe(4);

      // Each process should follow the naming convention
      for (const proc of zapProcesses) {
        expect(proc.name).toMatch(
          new RegExp(
            `^zap\\.${testProjectName}\\.(database|api|frontend|worker)$`,
          ),
        );
      }

      // Verify each expected service exists
      const processNames = zapProcesses.map(
        (proc: { name: string }) => proc.name,
      );
      expect(processNames).toContain(`zap.${testProjectName}.database`);
      expect(processNames).toContain(`zap.${testProjectName}.api`);
      expect(processNames).toContain(`zap.${testProjectName}.frontend`);
      expect(processNames).toContain(`zap.${testProjectName}.worker`);
    }, 45000);
  });
});
