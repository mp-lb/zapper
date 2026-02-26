import { CommandHandler, CommandContext } from "./CommandHandler";
import { confirm } from "../utils/confirm";
import { CommandResult } from "./CommandResult";

export class ResetCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;

    const proceed = await confirm(
      "This will stop all processes and delete the .zap folder. Continue?",
      { defaultYes: false, force: options.force },
    );
    if (!proceed) {
      return {
        kind: "reset",
        status: "aborted",
      };
    }
    await zapper.reset(true);
    return {
      kind: "reset",
      status: "completed",
    };
  }
}
