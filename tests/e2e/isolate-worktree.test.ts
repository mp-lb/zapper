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

describe("E2E: instances in a git worktree checkout", () => {
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

  it("treats a git worktree like any other checkout and initializes normally", () => {
    const fixtureName = `init-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    fixturePaths = setupWorktreeFixture(fixtureName);

    const initOutput = runZap(
      ["init", "--config", "zap.yaml"],
      fixturePaths.worktreeDir,
    );
    expect(initOutput).toContain('Initialized instance "default"');

    const selectedInstanceOutput = runZap(
      ["init", "-i", "--json", "--config", "zap.yaml"],
      fixturePaths.worktreeDir,
    );

    const lines = selectedInstanceOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const payload = JSON.parse(lines[lines.length - 1]) as {
      isolated: boolean;
      instanceId?: string;
    };

    expect(payload.isolated).toBe(true);
    expect(payload.instanceId).toMatch(/^[a-z0-9]{6}$/);

    const statePath = path.join(fixturePaths.worktreeDir, ".zap", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

    expect(state.instances.default.id).toBe(payload.instanceId);
  });
});
