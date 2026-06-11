import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// E2E coverage for the PM2 crash-loop and daemon-kill recovery work:
// - a fresh instant-exit app must trip PM2's restart cap and stop restarting
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

interface Pm2JlistEntry {
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
    unstable_restarts: number;
  };
}

function pm2Jlist(): Pm2JlistEntry[] {
  const output = execSync("pm2 jlist --silent", {
    encoding: "utf8",
    timeout: 10000,
  });

  const start = output.indexOf("[");
  return JSON.parse(start > 0 ? output.slice(start) : output);
}

function findPm2Process(
  projectName: string,
  service: string,
): Pm2JlistEntry | undefined {
  return pm2Jlist().find(
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
  try {
    for (const proc of pm2Jlist()) {
      if (!proc.name.startsWith(`zap.${projectName}.`)) continue;

      try {
        execSync(`pm2 delete "${proc.name}"`, {
          stdio: "ignore",
          timeout: 10000,
        });
      } catch {
        // Process might already be gone
      }
    }
  } catch {
    // PM2 might not be running at all
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

describe("E2E: PM2 crash-loop containment and recovery", () => {
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

    // The service can never come up, so zap up may report failure — the PM2
    // registration is what we care about.
    try {
      runZapCommand("up", projectDir, { timeout: 60000 });
    } catch {
      // expected
    }

    // Wait for PM2 to mark the app errored (restart cap tripped). With
    // max_restarts: 2 and exponential backoff this happens within seconds.
    let proc: Pm2JlistEntry | undefined;

    for (let attempt = 0; attempt < 30; attempt++) {
      proc = findPm2Process(projectName, "crasher");
      if (proc && proc.pm2_env.status === "errored") break;
      await sleep(1000);
    }

    expect(proc).toBeDefined();
    expect(proc!.pm2_env.status).toBe("errored");

    // The loop must actually have stopped: the restart counter no longer grows.
    const restartsBefore = proc!.pm2_env.restart_time;
    await sleep(3000);

    const after = findPm2Process(projectName, "crasher");
    expect(after!.pm2_env.status).toBe("errored");
    expect(after!.pm2_env.restart_time).toBe(restartsBefore);

    // And it stopped quickly — an unbounded loop reaches hundreds of restarts
    // per second.
    expect(restartsBefore).toBeLessThan(10);
  }, 90000);

  it("deregisters a registration whose wrapper script was deleted via the system audit", async () => {
    projectName = generateTestProjectName("stale");

    projectDir = createProject(
      projectName,
      `project: ${projectName}\nnative:\n  server:\n    cmd: node -e "setInterval(() => {}, 1000)"\n`,
    );

    runZapCommand("up", projectDir, { timeout: 60000 });

    const running = findPm2Process(projectName, "server");
    expect(running).toBeDefined();

    // Simulate a deleted worktree/instance: the wrapper scripts vanish while
    // the PM2 registration stays behind.
    const zapDir = path.join(projectDir, ".zap");

    for (const file of fs.readdirSync(zapDir)) {
      if (file.endsWith(".sh")) fs.unlinkSync(path.join(zapDir, file));
    }

    // The audit must flag the stale registration and prune must deregister it.
    const pruneOutput = runZapCommand("global prune --force --json", projectDir, {
      timeout: 60000,
    });

    expect(pruneOutput).toContain("Wrapper script no longer exists");

    const after = findPm2Process(projectName, "server");
    expect(after).toBeUndefined();
  }, 90000);

  it("surfaces a process holding a zap-assigned port but unknown to PM2 in zap global list", async () => {
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

    // A listener on the zap-assigned port that PM2 knows nothing about —
    // exactly what a daemon-kill survivor looks like.
    const listener = spawn(
      "node",
      ["-e", `require("net").createServer().listen(${port}, () => {})`],
      { detached: true, stdio: "ignore" },
    );

    listener.unref();

    try {
      await sleep(1500);

      const listOutput = runZapCommand("global list --json", projectDir, {
        timeout: 60000,
      });

      const result = JSON.parse(listOutput);

      const orphan = (result.orphans || []).find((entry: { reason: string }) =>
        entry.reason.includes(`port ${port}`),
      );

      expect(orphan).toBeDefined();
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
