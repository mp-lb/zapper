import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class DownCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    if (services) {
      await zapper.stopProcesses(services);
    } else {
      await zapper.stopProcesses();
    }

    return {
      kind: "services.action",
      action: "down",
      services,
    };
  }
}
