import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class HomeCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    if (service) {
      throw new Error("Home command does not accept arguments");
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) throw new Error("Context not loaded");

    if (!zapperContext.homepage) {
      throw new Error("No homepage configured. Set `homepage` in zap.yaml");
    }

    return {
      kind: "home.value",
      value: zapperContext.homepage,
    };
  }
}
