import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskRunner, TaskRegistry, TaskParams } from "./TaskRunner";
import { TaskNotFoundError } from "../../errors";
import * as childProcess from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function mockSuccessfulSpawn() {
  vi.mocked(childProcess.spawn).mockImplementation(() => {
    const child = createMockChildProcess();
    process.nextTick(() => child.emit("close", 0, null));
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
}

describe("TaskRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulSpawn();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parameter interpolation", () => {
    it("interpolates named parameters", async () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo Building {{target}}"],
        },
      };

      const params: TaskParams = {
        named: { target: "production" },
        rest: [],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("build");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo Building production",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("uses default values for missing params", async () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo Building {{target}}"],
          params: [{ name: "target", default: "development" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("build");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo Building development",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("overrides defaults with provided params", async () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo Building {{target}}"],
          params: [{ name: "target", default: "development" }],
        },
      };

      const params: TaskParams = {
        named: { target: "staging" },
        rest: [],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("build");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo Building staging",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("interpolates REST with pass-through arguments", async () => {
      const tasks: TaskRegistry = {
        test: {
          cmds: ["npm test {{REST}}"],
        },
      };

      const params: TaskParams = {
        named: {},
        rest: ["--coverage", "src/"],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("test");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "npm test --coverage src/",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("interpolates ARGS with shell-quoted pass-through arguments", async () => {
      const tasks: TaskRegistry = {
        test: {
          cmds: ["npm test {{ARGS}}"],
        },
      };

      const params: TaskParams = {
        named: {},
        rest: ["--coverage", "path with spaces", "can't", ""],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("test");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "npm test --coverage 'path with spaces' 'can'\\''t' ''",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("ARGS keeps a multi-word argument as a single shell token", async () => {
      // Regression: an argument with spaces must survive as ONE argv entry to
      // the underlying command, not be re-split by the task shell.
      const tasks: TaskRegistry = {
        forward: {
          cmds: ["node script.js {{ARGS}}"],
        },
      };

      const params: TaskParams = {
        named: {},
        rest: [
          "--notes",
          "two words",
          "--msg",
          "a; b",
          "--path",
          "with space/x",
        ],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("forward");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "node script.js --notes 'two words' --msg 'a; b' --path 'with space/x'",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("ARGS leaves space-free args untouched (no regression)", async () => {
      const tasks: TaskRegistry = {
        forward: {
          cmds: ["node script.js {{ARGS}}"],
        },
      };

      const params: TaskParams = {
        named: {},
        rest: ["--on", "worktree", "--name", "rfw:smoke"],
      };

      const runner = new TaskRunner(tasks, "/project", { params });
      await runner.run("forward");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "node script.js --on worktree --name rfw:smoke",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("interpolates special task vars", async () => {
      const tasks: TaskRegistry = {
        inspect: {
          cwd: "./tools",
          cmds: ["echo {{ROOT_DIR}} {{CWD}} {{TASK}} {{PROJECT}} {{INSTANCE}}"],
        },
      };

      const runner = new TaskRunner(tasks, "/project", {
        context: { projectName: "myapp", instanceKey: "e2e" },
      });

      await runner.run("inspect");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo /project /project/tools inspect myapp e2e",
        expect.objectContaining({ cwd: "/project/tools", shell: true }),
      );
    });

    it("leaves REST empty when no args provided", async () => {
      const tasks: TaskRegistry = {
        test: {
          cmds: ["npm test {{REST}}"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("test");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "npm test ",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("uses custom delimiters", async () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo Building <<target>>"],
        },
      };

      const params: TaskParams = {
        named: { target: "custom" },
        rest: [],
      };

      const runner = new TaskRunner(tasks, "/project", {
        delimiters: ["<<", ">>"],
        params,
      });

      await runner.run("build");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo Building custom",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });
  });

  describe("parameter validation", () => {
    it("throws on missing required param", async () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");

      await expect(runner.run("deploy")).rejects.toThrow(
        "Required parameter 'env' not provided for task 'deploy'",
      );
    });

    it("prompts for missing required params in interactive mode", async () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true }],
        },
      };

      const promptParam = vi.fn().mockResolvedValue("staging");

      const runner = new TaskRunner(tasks, "/project", {
        promptMissingParams: true,
        promptParam,
      });

      await runner.run("deploy");

      expect(promptParam).toHaveBeenCalledWith("deploy", {
        name: "env",
        required: true,
      });

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo staging",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });

    it("still fails when an interactive prompt returns an empty required param", async () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true }],
        },
      };

      const runner = new TaskRunner(tasks, "/project", {
        promptMissingParams: true,
        promptParam: vi.fn().mockResolvedValue(""),
      });

      await expect(runner.run("deploy")).rejects.toThrow(
        "Required parameter 'env' not provided for task 'deploy'",
      );
    });

    it("allows required param with default", async () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true, default: "dev" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("deploy");

      expect(childProcess.spawn).toHaveBeenCalled();
    });

    it("allows optional params to be omitted", async () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo {{verbose}}"],
          params: [{ name: "verbose" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("build");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo ",
        expect.objectContaining({ cwd: "/project", shell: true }),
      );
    });
  });

  describe("output formatting", () => {
    it("prints command headers brightly and command output in grey", async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        const child = createMockChildProcess();
        process.nextTick(() => {
          child.stdout.emit("data", "hello\n");
          child.emit("close", 0, null);
        });

        return child as unknown as ReturnType<typeof childProcess.spawn>;
      });

      const tasks: TaskRegistry = {
        build: { cmds: ["echo hello"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("build");

      expect(process.stdout.write).toHaveBeenCalledWith(
        "\u001B[1m\u001B[36mtask: [build] echo hello\u001B[0m\n",
      );

      expect(process.stdout.write).toHaveBeenCalledWith(
        "\u001B[90mhello\n\u001B[0m",
      );
    });

    it("suppresses command headers for silent tasks", async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        const child = createMockChildProcess();
        process.nextTick(() => {
          child.stdout.emit("data", "hello\n");
          child.emit("close", 0, null);
        });

        return child as unknown as ReturnType<typeof childProcess.spawn>;
      });

      const tasks: TaskRegistry = {
        build: { silent: true, cmds: ["echo hello"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("build");

      expect(process.stdout.write).not.toHaveBeenCalledWith(
        "\u001B[1m\u001B[36mtask: [build] echo hello\u001B[0m\n",
      );

      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringContaining("Running task: build"),
      );

      expect(process.stdout.write).toHaveBeenCalledWith(
        "\u001B[90mhello\n\u001B[0m",
      );
    });

    it("allows command-level silent overrides", async () => {
      const tasks: TaskRegistry = {
        build: { cmds: [{ cmd: "echo hello", silent: true }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("build");

      expect(process.stdout.write).not.toHaveBeenCalledWith(
        "\u001B[1m\u001B[36mtask: [build] echo hello\u001B[0m\n",
      );
    });

    it("rejects when a command exits non-zero", async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        const child = createMockChildProcess();
        process.nextTick(() => child.emit("close", 1, null));
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      });

      const tasks: TaskRegistry = {
        build: { cmds: ["exit 1"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await expect(runner.run("build")).rejects.toThrow(
        "Command failed with exit code 1: exit 1",
      );
    });
  });

  describe("interactive tasks", () => {
    it("runs task-level interactive commands with inherited stdio", async () => {
      const tasks: TaskRegistry = {
        console: { interactive: true, cmds: ["node"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("console");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "node",
        expect.objectContaining({
          cwd: "/project",
          shell: true,
          stdio: "inherit",
        }),
      );
    });

    it("runs command-level interactive commands with inherited stdio", async () => {
      const tasks: TaskRegistry = {
        console: { cmds: [{ cmd: "node", interactive: true }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("console");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "node",
        expect.objectContaining({ stdio: "inherit" }),
      );
    });
  });

  describe("task context env", () => {
    it("passes task context through ZAPPER_* env vars", async () => {
      const tasks: TaskRegistry = {
        inspect: {
          cwd: "tools",
          resolvedEnv: { EXISTING: "value" },
          cmds: ["env"],
        },
      };

      const runner = new TaskRunner(tasks, "/project", {
        context: { projectName: "myapp", instanceKey: "abc123" },
      });

      await runner.run("inspect");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "env",
        expect.objectContaining({
          cwd: "/project/tools",
          env: expect.objectContaining({
            EXISTING: "value",
            ZAPPER_ROOT: "/project",
            ZAPPER_CWD: "/project/tools",
            ZAPPER_TASK: "inspect",
            ZAPPER_PROJECT: "myapp",
            ZAPPER_INSTANCE: "abc123",
          }),
        }),
      );
    });
  });

  describe("preconditions", () => {
    it("runs commands when all preconditions pass", async () => {
      const tasks: TaskRegistry = {
        deploy: {
          preconditions: ['test -n "$DATABASE_URL"'],
          cmds: ["echo deploy"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("deploy");

      expect(childProcess.spawn).toHaveBeenNthCalledWith(
        1,
        'test -n "$DATABASE_URL"',
        expect.objectContaining({ stdio: ["ignore", "ignore", "ignore"] }),
      );

      expect(childProcess.spawn).toHaveBeenNthCalledWith(
        2,
        "echo deploy",
        expect.any(Object),
      );
    });

    it("fails with a custom message when a precondition fails", async () => {
      vi.mocked(childProcess.spawn).mockImplementationOnce(() => {
        const child = createMockChildProcess();
        process.nextTick(() => child.emit("close", 1, null));
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      });

      const tasks: TaskRegistry = {
        deploy: {
          preconditions: [
            {
              sh: "test -f ./app",
              msg: "Application binary missing",
            },
          ],
          cmds: ["echo deploy"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await expect(runner.run("deploy")).rejects.toThrow(
        "Application binary missing",
      );

      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("status checks", () => {
    it("skips commands when status checks pass", async () => {
      const tasks: TaskRegistry = {
        install: {
          status: ["test -d node_modules"],
          cmds: ["pnpm install"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("install");

      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        "test -d node_modules",
        expect.objectContaining({ stdio: ["ignore", "ignore", "ignore"] }),
      );
    });

    it("runs commands when a status check fails", async () => {
      vi.mocked(childProcess.spawn)
        .mockImplementationOnce(() => {
          const child = createMockChildProcess();
          process.nextTick(() => child.emit("close", 1, null));
          return child as unknown as ReturnType<typeof childProcess.spawn>;
        })
        .mockImplementationOnce(() => {
          const child = createMockChildProcess();
          process.nextTick(() => child.emit("close", 0, null));
          return child as unknown as ReturnType<typeof childProcess.spawn>;
        });

      const tasks: TaskRegistry = {
        install: {
          status: ["test -d node_modules"],
          cmds: ["pnpm install"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("install");

      expect(childProcess.spawn).toHaveBeenNthCalledWith(
        2,
        "pnpm install",
        expect.any(Object),
      );
    });

    it("runs commands with force even when status checks would pass", async () => {
      const tasks: TaskRegistry = {
        install: {
          status: ["test -d node_modules"],
          cmds: ["pnpm install"],
        },
      };

      const runner = new TaskRunner(tasks, "/project", { force: true });
      await runner.run("install");

      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        "pnpm install",
        expect.any(Object),
      );
    });
  });

  describe("taskAcceptsRest", () => {
    it("returns true when task has REST placeholder", () => {
      const task = { cmds: ["npm test {{REST}}"] };
      expect(TaskRunner.taskAcceptsRest(task)).toBe(true);
    });

    it("returns true when task has ARGS placeholder", () => {
      const task = { cmds: ["npm test {{ARGS}}"] };
      expect(TaskRunner.taskAcceptsRest(task)).toBe(true);
    });

    it("returns false when task has no REST placeholder", () => {
      const task = { cmds: ["npm test"] };
      expect(TaskRunner.taskAcceptsRest(task)).toBe(false);
    });

    it("respects custom delimiters", () => {
      const task = { cmds: ["npm test <<REST>>"] };
      expect(TaskRunner.taskAcceptsRest(task, ["<<", ">>"])).toBe(true);
      expect(TaskRunner.taskAcceptsRest(task, ["{{", "}}"])).toBe(false);
    });
  });

  describe("nested tasks", () => {
    it("executes nested task references", async () => {
      const tasks: TaskRegistry = {
        build: { cmds: ["echo build"] },
        deploy: { cmds: [{ task: "build" }, "echo deploy"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("deploy");

      expect(childProcess.spawn).toHaveBeenNthCalledWith(
        1,
        "echo build",
        expect.any(Object),
      );

      expect(childProcess.spawn).toHaveBeenNthCalledWith(
        2,
        "echo deploy",
        expect.any(Object),
      );
    });

    it("passes vars to nested task references", async () => {
      const tasks: TaskRegistry = {
        build: {
          params: [{ name: "target", required: true }],
          cmds: ["echo {{target}}"],
        },
        deploy: {
          cmds: [{ task: "build", vars: { target: "production" } }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("deploy");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo production",
        expect.any(Object),
      );
    });

    it("interpolates nested task vars from the parent context", async () => {
      const tasks: TaskRegistry = {
        build: {
          params: [{ name: "target", required: true }],
          cmds: ["echo {{target}}"],
        },
        deploy: {
          params: [{ name: "env", required: true }],
          cmds: [{ task: "build", vars: { target: "{{env}}" } }],
        },
      };

      const runner = new TaskRunner(tasks, "/project", {
        params: { named: { env: "staging" }, rest: [] },
      });

      await runner.run("deploy");

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "echo staging",
        expect.any(Object),
      );
    });

    it("allows nested task references to be silent", async () => {
      const tasks: TaskRegistry = {
        build: { cmds: ["echo build"] },
        deploy: { cmds: [{ task: "build", silent: true }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await runner.run("deploy");

      expect(process.stdout.write).not.toHaveBeenCalledWith(
        "\u001B[1m\u001B[36mtask: [build] echo build\u001B[0m\n",
      );

      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringContaining("Running task: build"),
      );
    });

    it("detects circular references", async () => {
      const tasks: TaskRegistry = {
        a: { cmds: [{ task: "b" }] },
        b: { cmds: [{ task: "a" }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await expect(runner.run("a")).rejects.toThrow(
        "Circular task reference detected",
      );
    });

    it("throws TaskNotFoundError for missing nested task references", async () => {
      const tasks: TaskRegistry = {
        deploy: { cmds: [{ task: "build" }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      await expect(runner.run("deploy")).rejects.toThrow(TaskNotFoundError);
      await expect(runner.run("deploy")).rejects.toThrow(
        "Task not found: build. Check task names or aliases",
      );
    });
  });
});
