import { parseYamlFile } from "../config/yamlParser";
import { ConfigValidationError } from "../errors";
import { resolveConfigPath } from "../utils/findUp";
import { CommandContext, CommandHandler } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

function validationErrorPayload(error: unknown): {
  name: string;
  message: string;
  issues?: string[];
  zodIssues?: unknown[];
} {
  if (error instanceof ConfigValidationError) {
    return {
      name: error.name,
      message: error.message,
      issues: error.issues,
      zodIssues: error.zodIssues,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name || error.constructor.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

export class ValidateCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const configOption = context.options.config as string | undefined;
    const resolvedPath = resolveConfigPath(configOption);

    if (!resolvedPath) {
      return {
        kind: "validate",
        valid: false,
        configPath: configOption ?? null,
        error: {
          name: "ConfigFileNotFoundError",
          message: configOption
            ? `Config file not found: ${configOption}`
            : "No zap.yaml config file found in current directory or parent directories",
        },
      };
    }

    try {
      parseYamlFile(resolvedPath);
      return {
        kind: "validate",
        valid: true,
        configPath: resolvedPath,
      };
    } catch (error) {
      return {
        kind: "validate",
        valid: false,
        configPath: resolvedPath,
        error: validationErrorPayload(error),
      };
    }
  }
}
