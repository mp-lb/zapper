import { RuntimeConfig } from "../config/schemas";
import { CommandContext, CommandHandler } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export interface RuntimeServiceInfo {
  name: string;
  provider: string;
  shell?: string;
  tools: Record<string, string>;
  source?: string;
  warning?: string;
  cmd: string;
}

const TOOL_KEYS = [
  "node",
  "pnpm",
  "python",
  "ruby",
  "go",
  "terraform",
] as const;

function runtimeProvider(runtime?: RuntimeConfig): string {
  return runtime?.provider || "ambient";
}

// For the shell provider, the binary the environment is captured from
function runtimeShell(runtime?: RuntimeConfig): string | undefined {
  if (runtime?.provider !== "shell") return undefined;
  return runtime.shell || process.env.SHELL || undefined;
}

function runtimeTools(runtime?: RuntimeConfig): Record<string, string> {
  if (!runtime) return {};

  const tools: Record<string, string> = {};

  for (const key of TOOL_KEYS) {
    const value = runtime[key];
    if (value) tools[key] = value;
  }

  return {
    ...tools,
    ...(runtime.tools || {}),
  };
}

export class RuntimeCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const zapperContext = context.zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const services = zapperContext.processes.map((process) => ({
      name: process.name,
      provider: runtimeProvider(process.runtime),
      shell: runtimeShell(process.runtime),
      tools: runtimeTools(process.runtime),
      source: process.runtime?.source,
      warning: process.runtime?.warning,
      cmd: process.cmd,
    }));

    return {
      kind: "runtime",
      project: {
        provider: runtimeProvider(zapperContext.runtime),
        shell: runtimeShell(zapperContext.runtime),
        tools: runtimeTools(zapperContext.runtime),
        source: zapperContext.runtime?.source,
        warning: zapperContext.runtime?.warning,
      },
      services,
    };
  }
}
