import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskRunner, TaskRegistry, TaskParams } from "./TaskRunner";
import * as childProcess from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

describe("TaskRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parameter interpolation", () => {
    it("interpolates named parameters", () => {
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
      runner.run("build");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "echo Building production",
        expect.objectContaining({ cwd: "/project" }),
      );
    });

    it("uses default values for missing params", () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo Building {{target}}"],
          params: [{ name: "target", default: "development" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      runner.run("build");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "echo Building development",
        expect.objectContaining({ cwd: "/project" }),
      );
    });

    it("overrides defaults with provided params", () => {
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
      runner.run("build");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "echo Building staging",
        expect.objectContaining({ cwd: "/project" }),
      );
    });

    it("interpolates REST with pass-through arguments", () => {
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
      runner.run("test");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "npm test --coverage src/",
        expect.objectContaining({ cwd: "/project" }),
      );
    });

    it("leaves REST empty when no args provided", () => {
      const tasks: TaskRegistry = {
        test: {
          cmds: ["npm test {{REST}}"],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      runner.run("test");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "npm test ",
        expect.objectContaining({ cwd: "/project" }),
      );
    });

    it("uses custom delimiters", () => {
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
      runner.run("build");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "echo Building custom",
        expect.objectContaining({ cwd: "/project" }),
      );
    });
  });

  describe("parameter validation", () => {
    it("throws on missing required param", () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");

      expect(() => runner.run("deploy")).toThrow(
        "Required parameter 'env' not provided for task 'deploy'",
      );
    });

    it("allows required param with default", () => {
      const tasks: TaskRegistry = {
        deploy: {
          cmds: ["echo {{env}}"],
          params: [{ name: "env", required: true, default: "dev" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      runner.run("deploy");

      expect(childProcess.execSync).toHaveBeenCalled();
    });

    it("allows optional params to be omitted", () => {
      const tasks: TaskRegistry = {
        build: {
          cmds: ["echo {{verbose}}"],
          params: [{ name: "verbose" }],
        },
      };

      const runner = new TaskRunner(tasks, "/project");
      runner.run("build");

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "echo ",
        expect.objectContaining({ cwd: "/project" }),
      );
    });
  });

  describe("taskAcceptsRest", () => {
    it("returns true when task has REST placeholder", () => {
      const task = { cmds: ["npm test {{REST}}"] };
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
    it("executes nested task references", () => {
      const tasks: TaskRegistry = {
        build: { cmds: ["echo build"] },
        deploy: { cmds: [{ task: "build" }, "echo deploy"] },
      };

      const runner = new TaskRunner(tasks, "/project");
      runner.run("deploy");

      expect(childProcess.execSync).toHaveBeenNthCalledWith(
        1,
        "echo build",
        expect.any(Object),
      );
      expect(childProcess.execSync).toHaveBeenNthCalledWith(
        2,
        "echo deploy",
        expect.any(Object),
      );
    });

    it("detects circular references", () => {
      const tasks: TaskRegistry = {
        a: { cmds: [{ task: "b" }] },
        b: { cmds: [{ task: "a" }] },
      };

      const runner = new TaskRunner(tasks, "/project");
      expect(() => runner.run("a")).toThrow("Circular task reference detected");
    });
  });
});
