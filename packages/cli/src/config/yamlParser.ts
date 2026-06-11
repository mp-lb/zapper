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

// Top-level keys reserved for external tools (e.g. `deploy`, owned by the
// deployment layer). Stripped at the parse boundary: Zapper does not validate,
// normalize, or expose their contents anywhere in the codebase.
const RESERVED_EXTERNAL_KEYS = ["deploy"];

function stripReservedExternalKeys<T>(parsed: T): T {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  for (const key of RESERVED_EXTERNAL_KEYS) {
    delete (parsed as Record<string, unknown>)[key];
  }

  return parsed;
}

export function parseYamlFile(filePath: string): ZapperConfig {
  if (!existsSync(filePath)) {
    throw new ConfigFileNotFoundError(filePath);
  }

  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = stripReservedExternalKeys(parse(content));
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
