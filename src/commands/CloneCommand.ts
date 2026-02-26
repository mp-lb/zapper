import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class CloneCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    const services = service
      ? Array.isArray(service)
        ? service
        : [service]
      : undefined;

    await zapper.cloneRepos(services);
    return {
      kind: "clone.completed",
      services,
    };
  }
}
