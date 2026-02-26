import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import path from "path";
import fs from "fs";

const CLI_PATH = path.join(__dirname, "../../dist/index.js");
const E2E_DATA_DIR = path.join(__dirname, "test-data");
const SETUP_SCRIPT_PATH = path.join(E2E_DATA_DIR, "create-worktree-fixture.sh");
const GENERATED_FIXTURES_DIR = path.join(E2E_DATA_DIR, "worktree-fixtures");

interface WorktreeFixturePaths {
  mainDir: string;
  worktreeDir: string;
}

function runZap(args: string[], cwd: string): string {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 10000,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const output = `${stdout}${stderr}`;

  if (result.status !== 0) {
    throw new Error(
      `Command failed: node ${CLI_PATH} ${args.join(" ")}\nOutput:\n${output}`,
    );
  }

  return output;
}

function setupWorktreeFixture(fixtureName: string): WorktreeFixturePaths {
  const setupOutput = execFileSync(
    "bash",
    [SETUP_SCRIPT_PATH, GENERATED_FIXTURES_DIR, fixtureName],
    { encoding: "utf8" },
  );

  const mainMatch = setupOutput.match(/^MAIN_DIR=(.+)$/m);
  const worktreeMatch = setupOutput.match(/^WORKTREE_DIR=(.+)$/m);

  if (!mainMatch || !worktreeMatch) {
    throw new Error(`Unexpected fixture setup output:\n${setupOutput}`);
  }

  return {
    mainDir: mainMatch[1],
    worktreeDir: worktreeMatch[1],
  };
}

function cleanupFixture(paths: WorktreeFixturePaths | null): void {
  if (!paths) return;

  const { mainDir, worktreeDir } = paths;

  try {
    if (fs.existsSync(mainDir) && fs.existsSync(worktreeDir)) {
      execFileSync(
        "git",
        ["-C", mainDir, "worktree", "remove", "--force", worktreeDir],
        {
          stdio: "ignore",
        },
      );
    }
  } catch {
    // Ignore cleanup failures and force-remove directories below.
  }

  if (fs.existsSync(worktreeDir)) {
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
  if (fs.existsSync(mainDir)) {
    fs.rmSync(mainDir, { recursive: true, force: true });
  }
}

describe("E2E: Isolate In Git Worktree", () => {
  let fixturePaths: WorktreeFixturePaths | null = null;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
    }
    if (!fs.existsSync(SETUP_SCRIPT_PATH)) {
      throw new Error(`Setup script not found at ${SETUP_SCRIPT_PATH}.`);
    }

    fs.mkdirSync(GENERATED_FIXTURES_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupFixture(fixturePaths);
    fixturePaths = null;
  });

  it("creates default and custom instance IDs without warning on isolate", () => {
    const fixtureName = `isolate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    fixturePaths = setupWorktreeFixture(fixtureName);

    const firstOutput = runZap(
      ["isolate", "--config", "zap.yaml"],
      fixturePaths.worktreeDir,
    );
    expect(firstOutput).toContain("Isolation enabled with instance ID:");
    expect(firstOutput).not.toContain("WORKTREE WARNING");

    const instanceConfigPath = path.join(
      fixturePaths.worktreeDir,
      ".zap",
      "instance.json",
    );
    const firstConfig = JSON.parse(fs.readFileSync(instanceConfigPath, "utf8"));

    expect(firstConfig.mode).toBe("isolate");
    expect(firstConfig.instanceId).toMatch(/^[a-z0-9]{6}$/);

    const customId = "feature-custom-123";
    const secondOutput = runZap(
      ["isolate", customId, "--config", "zap.yaml"],
      fixturePaths.worktreeDir,
    );
    expect(secondOutput).toContain(
      `Isolation enabled with instance ID: ${customId}`,
    );
    expect(secondOutput).not.toContain("WORKTREE WARNING");

    const secondConfig = JSON.parse(
      fs.readFileSync(instanceConfigPath, "utf8"),
    );
    expect(secondConfig).toEqual({
      instanceId: customId,
      mode: "isolate",
    });
  });
});
