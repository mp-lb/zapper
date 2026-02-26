import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class RestartCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    if (services) {
      await zapper.restartProcesses(services);
    } else {
      await zapper.restartProcesses();
    }

    return {
      kind: "services.action",
      action: "restart",
      services,
    };
  }
}
