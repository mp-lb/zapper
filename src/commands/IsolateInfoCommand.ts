import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { loadInstanceConfig } from "../config/instanceConfig";
import { detectWorktree } from "../utils/worktreeDetector";
import { resolveConfigPath } from "../utils/findUp";
import path from "path";

export class IsolateInfoCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;

    // Try to get project root from Zapper context first
    let projectRoot = zapper.getProjectRoot();

    // If not available (e.g., config load failed), try to find it from config path
    if (!projectRoot) {
      const configPath = resolveConfigPath(
        options.config as string | undefined,
      );
      if (configPath) {
        projectRoot = path.dirname(path.resolve(configPath));
      }
    }

    // If still no project root, check current directory
    if (!projectRoot) {
      projectRoot = process.cwd();
    }

    // Check for existing instance config
    const instanceConfig = loadInstanceConfig(projectRoot);

    // Check worktree status
    const worktreeInfo = detectWorktree(projectRoot);

    if (instanceConfig?.instanceId) {
      return {
        kind: "isolation.info",
        isolated: true,
        instanceId: instanceConfig.instanceId,
        mode: instanceConfig.mode || "isolate",
        worktree: worktreeInfo.isWorktree,
        configPath: path.join(projectRoot, ".zap", "instance.json"),
      };
    }

    return {
      kind: "isolation.info",
      isolated: false,
      mode: worktreeInfo.isWorktree ? "worktree" : "normal",
      worktree: worktreeInfo.isWorktree,
    };
  }
}
