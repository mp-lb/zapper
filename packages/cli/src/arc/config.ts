import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import { z } from "zod";

// Arc operator config: a small pointer file saying where this machine's
// network config and credentials live. Default ~/.config/zap-arc/, but the
// files it points at can live anywhere. Resolution: --config flag (sets
// ZAP_ARC_CONFIG) > ZAP_ARC_CONFIG > default path.
const DEFAULT_CONFIG_PATH = join(homedir(), ".config/zap-arc/config.yaml");

const operatorConfigSchema = z
  .object({
    network: z.string().optional(),
    credentials: z.string().optional(),
  })
  .strict();

export type OperatorConfig = z.infer<typeof operatorConfigSchema>;

export function expandTilde(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function loadOperatorConfig(): OperatorConfig {
  const path = expandTilde(process.env.ZAP_ARC_CONFIG ?? DEFAULT_CONFIG_PATH);

  if (!existsSync(path)) return {};

  const config = operatorConfigSchema.parse(
    parse(readFileSync(path, "utf8")) ?? {},
  );

  return {
    network: config.network ? expandTilde(config.network) : undefined,
    credentials: config.credentials
      ? expandTilde(config.credentials)
      : undefined,
  };
}

export { DEFAULT_CONFIG_PATH };
