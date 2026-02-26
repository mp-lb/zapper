/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class ConfigCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;

    const zapperContext = zapper.getContext();
    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    // Create a filtered version of the context
    const showEnvs = !!options.showEnvs;
    const pretty = !!options.pretty;
    const filteredConfig = this.createFilteredConfig(zapperContext, showEnvs);
    return {
      kind: "config",
      filteredConfig,
      pretty,
    };
  }

  private createFilteredConfig(context: any, showEnvs: boolean): any {
    // Filter out env-related keys if showEnvs is false
    const filterEnvKeys = (obj: any): any => {
      if (!obj || typeof obj !== "object") return obj;

      if (Array.isArray(obj)) {
        return obj.map(filterEnvKeys);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip env-related keys unless showEnvs is true
        if (!showEnvs && (key === "env" || key === "resolvedEnv")) {
          continue;
        } else if (typeof value === "object") {
          result[key] = filterEnvKeys(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    // Include all fields from context, but filter env keys if needed
    return filterEnvKeys(context);
  }
}
