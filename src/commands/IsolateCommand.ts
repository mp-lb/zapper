import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class IsolateCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    if (Array.isArray(service)) {
      throw new Error("Isolate command accepts a single instance ID");
    }

    const instanceId = await zapper.isolateInstance(service);
    return {
      kind: "isolation.enabled",
      instanceId,
    };
  }
}
