import { CommandHandler, CommandContext } from "./CommandHandler";
import { renderer } from "../ui/renderer";

export class StartupLogCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { zapper, service } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : [];

    if (services.length === 0) {
      throw new Error(
        "At least one service name is required for startup-log command",
      );
    }

    for (const serviceName of services) {
      renderer.log.info(`Showing startup log for ${serviceName}`);
      await zapper.showStartupLog(serviceName);
    }
  }
}
