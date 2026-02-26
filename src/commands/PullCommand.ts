import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class PullCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper } = context;

    await zapper.gitPullAll();
    return {
      kind: "git.pull.completed",
    };
  }
}
