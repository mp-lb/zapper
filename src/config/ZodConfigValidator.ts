import { ZapperConfigSchema, ZapperConfig } from "./schemas";
import { ZodError } from "zod";
import { WhitelistResolver } from "./WhitelistResolver";
import { ConfigValidationError } from "../errors";

export class ZodConfigValidator {
  static validate(config: unknown): ZapperConfig {
    try {
      const validatedConfig = ZapperConfigSchema.parse(config);

      // Validate whitelist references early
      WhitelistResolver.validateReferences(validatedConfig);

      // Resolve whitelist references to arrays
      const resolvedConfig = WhitelistResolver.resolve(validatedConfig);

      this.autoPopulateNames(resolvedConfig);
      return resolvedConfig;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((err) => {
          const path = err.path.length > 0 ? `${err.path.join(".")}: ` : "";
          return `${path}${err.message}`;
        });

        throw new ConfigValidationError(errorMessages);
      }

      throw error;
    }
  }

  private static autoPopulateNames(config: ZapperConfig): void {
    if (config.native) {
      for (const [name, proc] of Object.entries(config.native)) {
        if (!proc.name) {
          proc.name = name;
        }
      }
    }

    if (config.docker) {
      for (const [name, container] of Object.entries(config.docker)) {
        if (!container.name) {
          container.name = name;
        }
      }
    }

    if (config.containers) {
      for (const [name, container] of Object.entries(config.containers)) {
        if (!container.name) {
          container.name = name;
        }
      }
    }

    if (config.tasks) {
      for (const [name, task] of Object.entries(config.tasks)) {
        if (!task.name) {
          task.name = name;
        }
      }
    }
  }
}
