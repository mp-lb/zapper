import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

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
  return `e2e-env-precedence-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function parseJsonFromOutput(output: string): Record<string, string> {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, string>;
      }
    } catch {
      // Keep scanning for a JSON line.
    }
  }

  throw new Error(`Could not parse JSON from output:\n${output}`);
}

function readStateFile(fixtureDir: string): Record<string, unknown> | null {
  const statePath = path.join(fixtureDir, ".zap", "state.json");
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

describe("E2E: Environment File Precedence", () => {
  let testProjectName: string;
  let fixtureDir: string;
  let tempConfigPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
  });

  afterEach(() => {
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }

    if (fixtureDir) {
      const zapDir = path.join(fixtureDir, ".zap");
      if (fs.existsSync(zapDir)) {
        fs.rmSync(zapDir, { recursive: true, force: true });
      }
    }
  });

  it("should apply file precedence within environment sets", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "env-precedence");

    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    const originalConfig = fs.readFileSync(
      path.join(fixtureDir, "zap.yaml"),
      "utf8",
    );
    const uniqueConfig = originalConfig.replace(
      "project: env-precedence",
      `project: ${testProjectName}`,
    );
    fs.writeFileSync(tempConfigPath, uniqueConfig);

    const defaultOutput = runZapCommand(
      `env --service app --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const defaultResolvedEnv = parseJsonFromOutput(defaultOutput);

    expect(defaultResolvedEnv).toMatchObject({
      TEST_VALUE: "local-value",
      DB_HOST: "user-local-db",
      SHARED_ONLY: "from-shared",
      MODE: "local",
      SECRET_TOKEN: "local-secret",
    });

    const switchOutput = runZapCommand(
      `env remote --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    expect(switchOutput).toMatch(/remote|environment/i);

    const stateAfterSwitch = readStateFile(fixtureDir);
    expect(stateAfterSwitch).not.toBeNull();
    expect(stateAfterSwitch?.activeEnvironment).toBe("remote");

    const remoteOutput = runZapCommand(
      `env --service app --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const remoteResolvedEnv = parseJsonFromOutput(remoteOutput);

    expect(remoteResolvedEnv).toMatchObject({
      TEST_VALUE: "remote-value",
      DB_HOST: "user-remote-db",
      SHARED_ONLY: "from-shared",
      MODE: "remote",
      SECRET_TOKEN: "remote-secret",
    });

    runZapCommand(
      `env --disable --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );

    const resetOutput = runZapCommand(
      `env --service app --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const resetResolvedEnv = parseJsonFromOutput(resetOutput);

    expect(resetResolvedEnv).toMatchObject({
      TEST_VALUE: "local-value",
      DB_HOST: "user-local-db",
      SHARED_ONLY: "from-shared",
      MODE: "local",
      SECRET_TOKEN: "local-secret",
    });
  });
});
