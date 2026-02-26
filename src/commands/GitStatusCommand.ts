import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class GitStatusCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper } = context;

    await zapper.gitStatusAll();
    return {
      kind: "git.status.completed",
    };
  }
}
