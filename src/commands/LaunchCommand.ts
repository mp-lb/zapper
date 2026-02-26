import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { exec } from "child_process";

export class LaunchCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service: name } = context;
    if (Array.isArray(name)) {
      throw new Error("Launch command accepts a single link name");
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) throw new Error("Context not loaded");

    const link = name
      ? zapperContext.links.find((l) => l.name === name)?.url
      : zapperContext.homepage;

    if (!link) {
      if (name) throw new Error(`No link found for: ${name}`);
      throw new Error(
        "No homepage configured. Set `homepage` in zap.yaml or provide a link name: zap launch <name>",
      );
    }

    const openCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${openCmd} "${link}"`);
    return {
      kind: "launch.opened",
      url: link,
    };
  }
}
