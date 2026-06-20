import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import {
  cleanupNativeProcesses as cleanupProjectNativeProcesses,
  listNativeProcesses,
} from "./helpers/nativeProcesses";

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

async function cleanupNativeProcesses(projectName: string) {
  cleanupProjectNativeProcesses(CLI_PATH, FIXTURES_DIR, projectName);
}

function getRunningServices(projectName: string): string[] {
  return listNativeProcesses(CLI_PATH, FIXTURES_DIR, projectName).map(
    (proc) => proc.name.split(".").pop() || proc.name,
  );
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
    for (const proc of listNativeProcesses(CLI_PATH, FIXTURES_DIR)) {
      const match = /^zap\.(e2e-profiles-test-[^.]+)\./.exec(proc.name);
      if (match) {
        cleanupProjectNativeProcesses(CLI_PATH, FIXTURES_DIR, match[1]);
      }
    }
  });

  afterEach(async () => {
    if (testProjectName) {
      await cleanupNativeProcesses(testProjectName);
    }
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should list, select, and reset profiles end-to-end", async () => {
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
      const listOutput = runZapCommand("profile list", testDir, tempConfigPath);
      expect(listOutput).toContain("default");
      expect(listOutput).toContain("dev");
      expect(listOutput).toContain("prod");

      const listJsonOutput = runZapCommand(
        "profile list --json",
        testDir,
        tempConfigPath,
      );
      expect(JSON.parse(listJsonOutput)).toEqual(["default", "dev", "prod"]);

      const useOutput = runZapCommand(
        "profile use dev",
        testDir,
        tempConfigPath,
        {
          timeout: 45000,
        },
      );
      expect(useOutput).toContain("Selected profile: dev");

      const stateAfterUse = JSON.parse(
        runZapCommand("state", testDir, tempConfigPath),
      );
      expect(stateAfterUse.selectedProfile).toBe("dev");

      const statusWithDev = JSON.parse(
        runZapCommand("status --json", testDir, tempConfigPath),
      ) as StatusOutput;
      const workerStatusWithDev = statusWithDev.native.find(
        (service) => service.service === "worker",
      );
      const frontendStatusWithDev = statusWithDev.native.find(
        (service) => service.service === "frontend",
      );
      expect(workerStatusWithDev).toBeUndefined();
      expect(frontendStatusWithDev?.enabled).toBe(true);

      const resetOutput = runZapCommand(
        "profile reset --force",
        testDir,
        tempConfigPath,
        { timeout: 45000 },
      );
      expect(resetOutput).toContain("Reset profile to: default");

      const stateAfterReset = JSON.parse(
        runZapCommand("state", testDir, tempConfigPath),
      );
      expect(stateAfterReset.selectedProfile).toBeUndefined();

      const statusWithDefault = JSON.parse(
        runZapCommand("status --json", testDir, tempConfigPath),
      ) as StatusOutput;
      const workerStatusWithDefault = statusWithDefault.native.find(
        (service) => service.service === "worker",
      );
      const frontendStatusWithDefault = statusWithDefault.native.find(
        (service) => service.service === "frontend",
      );
      expect(workerStatusWithDefault).toBeUndefined();
      expect(frontendStatusWithDefault).toBeUndefined();
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

  it("should start default services, then selected profile services", async () => {
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

      runZapCommand("profile use dev", testDir, tempConfigPath, {
        timeout: 45000,
      });
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
