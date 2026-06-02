import { CommandHandler, CommandContext } from "./CommandHandler";

export class WatchCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { zapper, service } = context;

    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    await zapper.watchServices(services);
  }
}
