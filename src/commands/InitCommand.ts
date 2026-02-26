import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { initializePorts, getPortsPath } from "../config/portsManager";
import { isolateProject, clearIsolation } from "../core/instanceResolver";
import { detectWorktree } from "../utils/worktreeDetector";
import { renderer } from "../ui/renderer";

export class InitCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;
    const ctx = zapper.getContext();

    if (!ctx) {
      throw new Error("Context not loaded");
    }

    const asInstance = Boolean(options.instance);
    const randomize = Boolean(options.random);

    const ports = initializePorts(ctx.projectRoot, ctx.ports || [], {
      randomizeAll: randomize,
    });

    let instanceId: string | undefined;
    if (asInstance) {
      instanceId = isolateProject(ctx.projectRoot);
      ctx.instanceId = instanceId;
    } else {
      clearIsolation(ctx.projectRoot);
      ctx.instanceId = undefined;
    }

    const warningShown = !asInstance && detectWorktree(ctx.projectRoot).isWorktree;
    if (warningShown) {
      renderer.warnings.printUnisolatedWorktree();
    }

    return {
      kind: "init",
      isolated: asInstance,
      instanceId,
      ports,
      path: getPortsPath(ctx.projectRoot),
      randomized: randomize,
      warningShown,
    };
  }
}
