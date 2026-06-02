import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult, ProjectLinkResult } from "./CommandResult";
import { getProjectLinks } from "./LinksCommand";
import { openUrl, resolveLaunchLink } from "./LaunchCommand";
import { select, SelectOption } from "../utils/select";

type SelectLink = (links: ProjectLinkResult[]) => Promise<ProjectLinkResult>;

function toSelectOptions(
  links: ProjectLinkResult[],
): SelectOption<ProjectLinkResult>[] {
  return links.map((link) => ({
    label: link.name,
    description: link.isHomepage ? `${link.url} (homepage)` : link.url,
    value: link,
  }));
}

function openedResult(link: string): CommandResult {
  return {
    kind: "launch.opened",
    url: link,
    report: {
      status: "success",
      action: "launch",
      opened: {
        status: "success",
        url: link,
      },
    },
  };
}

export class OpenCommand extends CommandHandler {
  private readonly selectLink: SelectLink;

  constructor(
    selectLink: SelectLink = (links) =>
      select("Open a project link", toSelectOptions(links)),
  ) {
    super();
    this.selectLink = selectLink;
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service: name, options } = context;

    if (Array.isArray(name)) {
      throw new Error("Open command accepts a single link name");
    }

    if (options.home && name) {
      throw new Error("Open command accepts either --home or a link name");
    }

    const shouldSelect =
      !options.home &&
      !name &&
      !options.nonInteractive &&
      !options.json &&
      !options.jsonl;

    let link: string;

    if (shouldSelect) {
      const links = getProjectLinks(zapper);

      if (links.length === 0) {
        throw new Error(
          "No links configured. Set `homepage` or `links` in zap.yaml.",
        );
      }

      link =
        links.length === 1 ? links[0].url : (await this.selectLink(links)).url;
    } else if (options.home) {
      link = resolveLaunchLink(zapper);
    } else {
      link = resolveLaunchLink(zapper, name);
    }

    openUrl(link);
    return openedResult(link);
  }
}
