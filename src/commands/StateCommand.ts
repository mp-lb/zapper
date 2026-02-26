import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class StateCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper } = context;

    const zapperContext = zapper.getContext();
    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    return {
      kind: "state",
      state: zapperContext.state,
    };
  }
}
