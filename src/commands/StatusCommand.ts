import { CommandHandler, CommandContext } from "./CommandHandler";
import { getStatus } from "../core/getStatus";
import { CommandResult } from "./CommandResult";

export class StatusCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service, options } = context;
    const all = !!options.all;
    const zapperContext = zapper.getContext() || undefined;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;
    const statusResult = await getStatus(zapperContext, services, all);
    return {
      kind: "status",
      statusResult,
      context: zapperContext,
    };
  }
}
