import { readFileSync, existsSync } from "fs";
import { parse } from "yaml";
import { ZodConfigValidator } from "./ZodConfigValidator";
import { ZapperConfig } from "./schemas";
import { normalizeConfig } from "./configNormalizer";
import {
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  WhitelistReferenceError,
} from "../errors";

export function parseYamlFile(filePath: string): ZapperConfig {
  if (!existsSync(filePath)) {
    throw new ConfigFileNotFoundError(filePath);
  }

  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = parse(content);
    const normalized = normalizeConfig(parsed);
    return ZodConfigValidator.validate(normalized);
  } catch (error) {
    // Let custom errors pass through
    if (
      error instanceof ConfigFileNotFoundError ||
      error instanceof ConfigValidationError ||
      error instanceof WhitelistReferenceError
    ) {
      throw error;
    }
    throw new ConfigParseError(filePath, error);
  }
}
