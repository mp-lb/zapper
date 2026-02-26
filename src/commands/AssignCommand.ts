import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import {
  assignRandomPorts,
  savePorts,
  getPortsPath,
} from "../config/portsManager";

export class AssignCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper } = context;
    const ctx = zapper.getContext();

    if (!ctx) {
      throw new Error("Context not loaded");
    }

    if (!ctx.ports || ctx.ports.length === 0) {
      // No ports defined, return empty result
      return {
        kind: "assign",
        ports: {},
        path: getPortsPath(ctx.projectRoot),
      };
    }

    // Generate random ports
    const newPorts = assignRandomPorts(ctx.ports);

    // Save to .zap/ports.json
    savePorts(ctx.projectRoot, newPorts);

    const portsPath = getPortsPath(ctx.projectRoot);

    return {
      kind: "assign",
      ports: newPorts,
      path: portsPath,
    };
  }
}
