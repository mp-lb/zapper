import { execSync } from "child_process";
import { renderer } from "../../ui/renderer";
import * as path from "path";
import Mustache from "mustache";
import { TaskParam } from "../../config/schemas";

export interface TaskParams {
  named: Record<string, string>;
  rest: string[];
}

export interface Task {
  cmds: Array<string | { task: string }>;
  cwd?: string;
  desc?: string;
  resolvedEnv?: Record<string, string>;
  params?: TaskParam[];
}

export type TaskRegistry = Record<string, Task>;

export interface TaskRunnerOptions {
  delimiters?: [string, string];
  params?: TaskParams;
}

export class TaskRunner {
  private tasks: TaskRegistry;
  private baseCwd: string;
  private delimiters: [string, string];
  private params: TaskParams;

  constructor(
    tasks: TaskRegistry,
    baseCwd: string,
    options: TaskRunnerOptions = {},
  ) {
    this.tasks = tasks;
    this.baseCwd = baseCwd;
    this.delimiters = options.delimiters || ["{{", "}}"];
    this.params = options.params || { named: {}, rest: [] };
  }

  private resolveCwd(tCwd?: string): string {
    if (!tCwd || tCwd.trim().length === 0) return this.baseCwd;
    return path.isAbsolute(tCwd) ? tCwd : path.join(this.baseCwd, tCwd);
  }

  private interpolate(cmd: string, taskParams?: TaskParam[]): string {
    // Build context from params, applying defaults
    const context: Record<string, string> = {};

    // Apply task-defined params with defaults first
    if (taskParams) {
      for (const param of taskParams) {
        if (param.default !== undefined) {
          context[param.name] = param.default;
        }
      }
    }

    // Override with provided named params
    for (const [key, value] of Object.entries(this.params.named)) {
      context[key] = value;
    }

    // Add REST as joined string
    context["REST"] = this.params.rest.join(" ");

    // Set custom delimiters for Mustache
    Mustache.tags = this.delimiters;

    // Disable HTML escaping for shell commands
    const originalEscape = Mustache.escape;
    Mustache.escape = (text) => text;

    try {
      return Mustache.render(cmd, context);
    } finally {
      Mustache.escape = originalEscape;
    }
  }

  private validateParams(taskName: string, taskParams?: TaskParam[]): void {
    if (!taskParams) return;

    for (const param of taskParams) {
      if (param.required && param.default === undefined) {
        if (!(param.name in this.params.named)) {
          throw new Error(
            `Required parameter '${param.name}' not provided for task '${taskName}'`,
          );
        }
      }
    }

    // Warn about unknown params
    const knownParams = new Set(taskParams.map((p) => p.name));
    for (const key of Object.keys(this.params.named)) {
      if (!knownParams.has(key) && key !== "json" && key !== "list-params") {
        renderer.log.warn(`Unknown parameter '${key}' for task '${taskName}'`);
      }
    }
  }

  private execTask(name: string, stack: string[] = []): void {
    if (!this.tasks[name]) throw new Error(`Task not found: ${name}`);

    if (stack.includes(name)) {
      throw new Error(
        `Circular task reference detected: ${[...stack, name].join(" -> ")}`,
      );
    }

    const task = this.tasks[name];

    // Only validate params for the top-level task
    if (stack.length === 0) {
      this.validateParams(name, task.params);
    }

    const env = {
      ...process.env,
      ...(task.resolvedEnv || {}),
    } as NodeJS.ProcessEnv;

    const cwd = this.resolveCwd(task.cwd);
    renderer.log.info(
      `Running task: ${name}${task.desc ? ` — ${task.desc}` : ""}`,
    );

    for (const cmd of task.cmds) {
      if (typeof cmd === "string") {
        const interpolatedCmd = this.interpolate(cmd, task.params);
        renderer.log.debug(`$ ${interpolatedCmd}`);
        execSync(interpolatedCmd, { stdio: "inherit", cwd, env });
      } else if (cmd && typeof cmd === "object" && "task" in cmd) {
        this.execTask(cmd.task, [...stack, name]);
      } else {
        throw new Error(`Invalid command in task ${name}`);
      }
    }
  }

  run(taskName: string): void {
    this.execTask(taskName);
  }

  static runTask(
    tasks: TaskRegistry,
    baseCwd: string,
    taskName: string,
    options?: TaskRunnerOptions,
  ): void {
    const runner = new TaskRunner(tasks, baseCwd, options);
    runner.run(taskName);
  }

  static taskAcceptsRest(
    task: Task,
    delimiters: [string, string] = ["{{", "}}"],
  ): boolean {
    const restPattern = `${delimiters[0]}REST${delimiters[1]}`;
    return task.cmds.some(
      (cmd) => typeof cmd === "string" && cmd.includes(restPattern),
    );
  }
}
