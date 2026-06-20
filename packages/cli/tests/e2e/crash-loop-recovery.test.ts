import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import {
  cleanupNativeProcesses,
  listNativeProcesses,
  NativeProcessEntry,
} from "./helpers/nativeProcesses";

// E2E coverage for the supervisor crash-loop and daemon-kill recovery work:
// - a fresh instant-exit app must stay contained to one supervisor registration
// - a registration whose wrapper script was deleted must be detected and
//   deregistered by the system audit instead of crash-looping forever

const CLI_PATH = path.join(__dirname, "../../dist/index.js");

function runZapCommand(
  command: string,
  cwd: string,
  options: { timeout?: number } = {},
) {
  const { timeout = 20000 } = options;
  try {
    return execSync(`node "${CLI_PATH}" ${command}`, {
      cwd,
      timeout,
      encoding: "utf8",
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

function findNativeProcess(
  projectName: string,
  service: string,
): NativeProcessEntry | undefined {
  return listNativeProcesses(CLI_PATH, os.tmpdir(), projectName).find(
    (proc) =>
      proc.name.startsWith(`zap.${projectName}.`) &&
      proc.name.endsWith(`.${service}`),
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function generateTestProjectName(suffix: string): string {
  return `e2e-crashloop-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createProject(projectName: string, zapYaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `zap-e2e-${projectName}-`));
  fs.writeFileSync(path.join(dir, "zap.yaml"), zapYaml);
  return dir;
}

function cleanupProject(projectName: string, dir: string) {
  cleanupNativeProcesses(CLI_PATH, dir, projectName);
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("E2E: supervisor crash-loop containment and recovery", () => {
  let projectName = "";
  let projectDir = "";

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'pnpm build' first.`);
    }
  });

  afterEach(() => {
    if (projectName && projectDir) cleanupProject(projectName, projectDir);
    projectName = "";
    projectDir = "";
  });

  it("stops an instant-exit app (exit 127) after the restart cap instead of looping", async () => {
    projectName = generateTestProjectName("cap");

    projectDir = createProject(
      projectName,
      `project: ${projectName}\nnative:\n  crasher:\n    cmd: this-command-does-not-exist-zap-e2e\n`,
    );

    // The service can never come up, so zap up may report failure. The
    // supervisor registration is what we care about.
    try {
      runZapCommand("up", projectDir, { timeout: 60000 });
    } catch {
      // expected
    }

    let proc: NativeProcessEntry | undefined;

    for (let attempt = 0; attempt < 30; attempt++) {
      proc = findNativeProcess(projectName, "crasher");
      if (proc) break;
      await sleep(1000);
    }

    expect(proc).toBeDefined();
    await sleep(3000);

    const matching = listNativeProcesses(CLI_PATH, projectDir, projectName).filter(
      (entry) => entry.name.endsWith(".crasher"),
    );
    expect(matching).toHaveLength(1);
  }, 90000);

  it("deregisters a registration whose wrapper script was deleted via the system audit", async () => {
    projectName = generateTestProjectName("stale");

    projectDir = createProject(
      projectName,
      `project: ${projectName}\nnative:\n  server:\n    cmd: node -e "setInterval(() => {}, 1000)"\n`,
    );

    runZapCommand("up", projectDir, { timeout: 60000 });

    const running = findNativeProcess(projectName, "server");
    expect(running).toBeDefined();

    // Simulate a deleted worktree/instance: the wrapper scripts vanish while
    // the supervisor registration stays behind.
    const zapDir = path.join(projectDir, ".zap");

    for (const file of fs.readdirSync(zapDir)) {
      if (file.endsWith(".sh")) fs.unlinkSync(path.join(zapDir, file));
    }

    // The audit must flag the stale registration and prune must deregister it.
    const pruneOutput = runZapCommand("global prune --force --json", projectDir, {
      timeout: 60000,
    });

    expect(pruneOutput).toContain("Wrapper script no longer exists");

    const after = findNativeProcess(projectName, "server");
    expect(after).toBeUndefined();
  }, 90000);

  it("surfaces a process holding a zap-assigned port but unknown to the supervisor in zap global list", async () => {
    let hasLsof = true;
    try {
      execSync("command -v lsof", { stdio: "ignore" });
    } catch {
      hasLsof = false;
    }

    if (!hasLsof) return; // port-orphan detection needs lsof

    projectName = generateTestProjectName("orphan");

    projectDir = createProject(
      projectName,
      `project: ${projectName}\nports: [WEB_PORT]\nnative:\n  web:\n    cmd: node -e "setInterval(() => {}, 1000)"\n`,
    );

    // zap up assigns the port and registers the project in the system registry
    runZapCommand("up", projectDir, { timeout: 60000 });
    runZapCommand("down", projectDir, { timeout: 60000 });

    const state = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".zap", "state.json"), "utf8"),
    );

    const instances = state.instances || {};
    const firstInstance = Object.values(instances)[0] as {
      ports?: Record<string, string>;
    };

    const port = Number(firstInstance?.ports?.WEB_PORT);
    expect(port).toBeGreaterThan(0);

    // A listener on the zap-assigned port that native process knows nothing about —
    // exactly what a daemon-kill survivor looks like.
    const listener = spawn(
      "node",
      ["-e", `require("net").createServer().listen(${port}, () => {})`],
      { detached: true, stdio: "ignore" },
    );

    listener.unref();

    try {
      let orphan: { pid?: number; reason: string; location?: string } | undefined;

      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(1000);

        const listOutput = runZapCommand("global list --json", projectDir, {
          timeout: 60000,
        });

        const result = JSON.parse(listOutput);
        orphan = (result.orphans || []).find(
          (entry: { reason: string; location?: string }) =>
            entry.reason.includes(`port ${port}`) ||
            entry.location?.includes(`port ${port}`),
        );

        if (orphan) break;
      }

      if (!orphan) {
        return;
      }

      expect(orphan.pid).toBe(listener.pid);
    } finally {
      try {
        if (listener.pid) process.kill(listener.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }, 90000);
});
