import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const CLI_PATH = path.join(__dirname, "../../dist/index.js");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

type StatusService = {
  service: string;
  enabled: boolean;
};

type StatusOutput = {
  native: StatusService[];
};

function runZapCommand(
  command: string,
  cwd: string,
  configFile: string,
  options: { timeout?: number; encoding?: BufferEncoding } = {},
) {
  const { timeout = 15000, encoding = "utf8" } = options;
  try {
    return execSync(`node "${CLI_PATH}" --config "${configFile}" ${command}`, {
      cwd,
      timeout,
      encoding,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error: unknown) {
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

function generateTestProjectName(): string {
  return `e2e-profiles-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function cleanupPm2Processes(projectName: string) {
  try {
    execSync(`pm2 delete "zap.${projectName}.*" 2>/dev/null || true`, {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch (error) {
    // Ignore cleanup errors
  }
}

function getRunningServices(projectName: string): string[] {
  try {
    const pm2ListOutput = execSync("pm2 jlist --silent", { encoding: "utf8" });
    const pm2Processes = JSON.parse(pm2ListOutput);

    return pm2Processes
      .filter(
        (proc: { name: string; pm2_env?: { status?: string } }) =>
          proc.name?.startsWith(`zap.${projectName}.`) &&
          proc.pm2_env?.status === "online",
      )
      .map((proc: { name: string }) => proc.name.split(".").pop());
  } catch (error) {
    return [];
  }
}

describe("E2E: Profiles Command", () => {
  let testProjectName: string;
  let fixtureDir: string;
  let testDir: string;
  let tempConfigPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
    fixtureDir = path.join(FIXTURES_DIR, "multi-service");
  });

  afterAll(() => {
    try {
      const output = execSync("pm2 jlist --silent", {
        encoding: "utf8",
        timeout: 5000,
      });
      const processes = JSON.parse(output);
      for (const proc of processes) {
        if (proc.name?.startsWith("zap.e2e-profiles-test-")) {
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
    if (testProjectName) {
      await cleanupPm2Processes(testProjectName);
    }
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should list profiles, enable one, and disable it end-to-end", async () => {
    testProjectName = generateTestProjectName();
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "zapper-e2e-profiles-fixture-"),
    );
    tempConfigPath = path.join(testDir, `zap-${testProjectName}.yaml`);

    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const fixtureEnvPath = path.join(fixtureDir, ".env");
    if (fs.existsSync(fixtureEnvPath)) {
      fs.copyFileSync(fixtureEnvPath, path.join(testDir, ".env"));
    }
    const uniqueConfig = originalConfig.replace(
      "project: multi-service-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    try {
      const listOutput = runZapCommand(
        "profile --list",
        testDir,
        tempConfigPath,
      );
      expect(listOutput).toContain("dev");
      expect(listOutput).toContain("prod");

      const listJsonOutput = runZapCommand(
        "profile --list --json",
        testDir,
        tempConfigPath,
      );
      expect(JSON.parse(listJsonOutput)).toEqual(["dev", "prod"]);

      const enableOutput = runZapCommand(
        "profile dev",
        testDir,
        tempConfigPath,
        {
          timeout: 45000,
        },
      );
      expect(enableOutput).toContain("Enabling profile: dev");
      expect(enableOutput).toContain("Starting services: frontend");

      const stateAfterEnable = JSON.parse(
        runZapCommand("state", testDir, tempConfigPath),
      );
      expect(stateAfterEnable.activeProfile).toBe("dev");

      const statusWithDev = JSON.parse(
        runZapCommand("status --json", testDir, tempConfigPath),
      ) as StatusOutput;
      const workerStatusWithDev = statusWithDev.native.find(
        (service) => service.service === "worker",
      );
      const frontendStatusWithDev = statusWithDev.native.find(
        (service) => service.service === "frontend",
      );
      expect(workerStatusWithDev?.enabled).toBe(false);
      expect(frontendStatusWithDev?.enabled).toBe(true);

      const disableOutput = runZapCommand(
        "profile --disable",
        testDir,
        tempConfigPath,
        { timeout: 45000 },
      );
      expect(disableOutput).toContain("Active profile disabled");

      const stateAfterDisable = JSON.parse(
        runZapCommand("state", testDir, tempConfigPath),
      );
      expect(stateAfterDisable.activeProfile).toBeUndefined();

      const statusWithoutProfile = JSON.parse(
        runZapCommand("status --json", testDir, tempConfigPath),
      ) as StatusOutput;
      const workerStatusWithoutProfile = statusWithoutProfile.native.find(
        (service) => service.service === "worker",
      );
      const frontendStatusWithoutProfile = statusWithoutProfile.native.find(
        (service) => service.service === "frontend",
      );
      expect(workerStatusWithoutProfile?.enabled).toBe(false);
      expect(frontendStatusWithoutProfile?.enabled).toBe(false);

      const runningAfterDisable = getRunningServices(testProjectName);
      expect(runningAfterDisable).toContain("database");
      expect(runningAfterDisable).toContain("api");
      expect(runningAfterDisable).not.toContain("frontend");
      expect(runningAfterDisable).not.toContain("worker");
    } finally {
      try {
        runZapCommand("down", testDir, tempConfigPath, {
          timeout: 20000,
        });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 60000);

  it("should start unprofiled services first, then add profiled services after enabling a profile and restarting", async () => {
    testProjectName = generateTestProjectName();
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "zapper-e2e-profiles-fixture-"),
    );
    tempConfigPath = path.join(testDir, `zap-${testProjectName}.yaml`);

    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const fixtureEnvPath = path.join(fixtureDir, ".env");
    if (fs.existsSync(fixtureEnvPath)) {
      fs.copyFileSync(fixtureEnvPath, path.join(testDir, ".env"));
    }
    const uniqueConfig = originalConfig.replace(
      "project: multi-service-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    try {
      runZapCommand("up", testDir, tempConfigPath, { timeout: 45000 });
      const runningWithoutProfile = getRunningServices(testProjectName);
      expect(runningWithoutProfile).toContain("database");
      expect(runningWithoutProfile).toContain("api");
      expect(runningWithoutProfile).not.toContain("frontend");
      expect(runningWithoutProfile).not.toContain("worker");

      runZapCommand("profile dev", testDir, tempConfigPath, { timeout: 45000 });
      runZapCommand("restart", testDir, tempConfigPath, { timeout: 45000 });

      const runningWithDevProfile = getRunningServices(testProjectName);
      expect(runningWithDevProfile).toContain("database");
      expect(runningWithDevProfile).toContain("api");
      expect(runningWithDevProfile).toContain("frontend");
      expect(runningWithDevProfile).not.toContain("worker");
    } finally {
      try {
        runZapCommand("down", testDir, tempConfigPath, {
          timeout: 20000,
        });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 90000);
});
