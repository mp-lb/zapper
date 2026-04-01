import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult, ProjectLinkResult } from "./CommandResult";

export class LinksCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service } = context;
    if (service) {
      throw new Error("Links command does not accept arguments");
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) throw new Error("Context not loaded");

    const links: ProjectLinkResult[] = [];

    if (zapperContext.homepage) {
      links.push({
        name: "Home",
        url: zapperContext.homepage,
        isHomepage: true,
      });
    }

    for (const link of zapperContext.links) {
      links.push({
        name: link.name,
        url: link.url,
        isHomepage: false,
      });
    }

    return {
      kind: "links.list",
      links,
    };
  }
}
