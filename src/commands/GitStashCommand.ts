import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class GitStashCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper } = context;

    await zapper.gitStashAll();
    return {
      kind: "git.stash.completed",
    };
  }
}
