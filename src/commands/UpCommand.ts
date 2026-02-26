import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class UpCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    if (services) {
      await zapper.startProcesses(services);
    } else {
      await zapper.startProcesses();
    }

    return {
      kind: "services.action",
      action: "up",
      services,
    };
  }
}
