import { CommandHandler, CommandContext } from "./CommandHandler";
import { getServiceList } from "../core/getServiceList";
import { CommandResult } from "./CommandResult";

export class ListCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    const listResult = await getServiceList(zapperContext, services);

    return {
      kind: "list",
      listResult,
      context: zapperContext,
    };
  }
}
