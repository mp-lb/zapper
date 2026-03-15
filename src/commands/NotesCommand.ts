import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class NotesCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    if (service) {
      throw new Error("Notes command does not accept arguments");
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) throw new Error("Context not loaded");

    if (!zapperContext.notes) {
      throw new Error("No notes configured. Set `notes` in zap.yaml");
    }

    return {
      kind: "notes.value",
      value: zapperContext.notes,
    };
  }
}
