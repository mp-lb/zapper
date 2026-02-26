import path from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface InstanceConfig {
  instanceId?: string | null;
  mode?: "isolate" | "exclusive";
}

const INSTANCE_CONFIG_FILE = "instance.json";

/**
 * Load instance configuration from .zap/instance.json
 * Returns null if the file doesn't exist (vs empty object if file exists but is empty)
 */
export function loadInstanceConfig(projectRoot: string): InstanceConfig | null {
  const zapDir = path.join(projectRoot, ".zap");
  const configPath = path.join(zapDir, INSTANCE_CONFIG_FILE);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(content);
    return parsed as InstanceConfig;
  } catch (error) {
    // If we can't parse the file, treat it as if it doesn't exist
    return null;
  }
}

/**
 * Save instance configuration to .zap/instance.json
 * Creates the .zap directory if it doesn't exist
 */
export function saveInstanceConfig(
  projectRoot: string,
  config: InstanceConfig,
): void {
  const zapDir = path.join(projectRoot, ".zap");
  const configPath = path.join(zapDir, INSTANCE_CONFIG_FILE);

  // Ensure .zap directory exists
  if (!existsSync(zapDir)) {
    mkdirSync(zapDir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, content, "utf8");
}
