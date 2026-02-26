import { CommandHandler, CommandContext } from "./CommandHandler";
import { renderer } from "../ui/renderer";

export class LogsCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { zapper, service, options } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : [];

    if (services.length === 0) {
      throw new Error("At least one service name is required for logs command");
    }

    const follow = options.follow ?? true;
    if (services.length > 1 && follow) {
      throw new Error(
        "Cannot follow logs for multiple services. Use --no-follow or request a single service.",
      );
    }

    for (const serviceName of services) {
      renderer.log.info(
        `Showing logs for ${serviceName}${follow ? " (following)" : ""}`,
      );
      await zapper.showLogs(serviceName, follow);
    }
  }
}
