import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  hasProjectServiceProcess,
  isProjectProcessName,
} from "./helpers/processNames";
import {
  cleanupNativeProcesses as cleanupProjectNativeProcesses,
  listNativeProcesses,
} from "./helpers/nativeProcesses";

const CLI_PATH = path.join(__dirname, "../../dist/index.js");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

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
  return `e2e-alias-dedup-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function cleanupNativeProcesses(projectName: string) {
  if (!projectName) return;
  cleanupProjectNativeProcesses(CLI_PATH, FIXTURES_DIR, projectName);
}

function getProjectProcesses(projectName: string): Array<{ name: string }> {
  return listNativeProcesses(CLI_PATH, FIXTURES_DIR, projectName);
}

describe("E2E: Alias Deduplication", () => {
  let testProjectName = "";
  let fixtureDir = "";
  let tempConfigPath = "";

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
  });

  afterEach(async () => {
    await cleanupNativeProcesses(testProjectName);
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  it("should treat canonical names and aliases as one service target", async () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "aliases-project");
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);

    const baseConfigPath = path.join(fixtureDir, "zap.yaml");
    const baseConfig = fs.readFileSync(baseConfigPath, "utf8");
    const testConfig = baseConfig.replace(
      "project: aliases-test",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, testConfig);

    runZapCommand(
      `up --config zap-${testProjectName}.yaml webserver web database db`,
      fixtureDir,
      { timeout: 20000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const running = getProjectProcesses(testProjectName).map(
      (proc) => proc.name,
    );
    expect(
      running.some((name) =>
        hasProjectServiceProcess(name, testProjectName, "webserver"),
      ),
    ).toBe(true);
    expect(
      running.some((name) =>
        hasProjectServiceProcess(name, testProjectName, "database"),
      ),
    ).toBe(true);
    expect(running.length).toBe(2);

    runZapCommand(
      `down --config zap-${testProjectName}.yaml web webserver db database`,
      fixtureDir,
      { timeout: 20000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(getProjectProcesses(testProjectName).length).toBe(0);
  }, 40000);
});
