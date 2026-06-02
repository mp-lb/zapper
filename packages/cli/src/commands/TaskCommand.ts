import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { TaskNotFoundError } from "../errors";

export class TaskCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options, taskParams } = context;

    if (Array.isArray(service)) {
      throw new Error("Task command accepts a single task name");
    }

    if (!service) {
      const zapperContext = zapper.getContext();
      if (!zapperContext) throw new Error("Context not loaded");
      return {
        kind: "tasks.list",
        tasks: zapperContext.tasks,
      };
    }

    // Handle --list-params option
    if (options.listParams) {
      const zapperContext = zapper.getContext();
      if (!zapperContext) throw new Error("Context not loaded");

      const resolvedTaskName = zapper.resolveTaskName(service);
      const task = zapperContext.tasks.find((t) => t.name === resolvedTaskName);
      if (!task) throw new TaskNotFoundError(service);
      return {
        kind: "tasks.params",
        task,
        delimiters: zapperContext.taskDelimiters,
      };
    }

    await zapper.runTask(service, taskParams, {
      force: Boolean(options.force),
      promptMissingParams: Boolean(options.interactive),
    });
  }
}
