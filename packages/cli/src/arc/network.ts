import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  networkConfigSchema,
  NetworkConfig,
  NETWORK_KNOWN_KEYS,
} from "./schemas";
import { loadOperatorConfig, DEFAULT_CONFIG_PATH, expandTilde } from "./config";

// The network config is the sharing seam: backend, providers, registry,
// module defaults — the whole cloud opinion of an arc network, as data.
// Located via the operator config (or ZAP_ARC_NETWORK_FILE).
export function loadNetwork(): NetworkConfig {
  const path = process.env.ZAP_ARC_NETWORK_FILE
    ? expandTilde(process.env.ZAP_ARC_NETWORK_FILE)
    : loadOperatorConfig().network;

  if (!path || !existsSync(path)) {
    throw new Error(
      `No arc network config found. Point ${DEFAULT_CONFIG_PATH} (or ZAP_ARC_CONFIG / zap arc --config) at a config with a 'network:' path, or set ZAP_ARC_NETWORK_FILE.`,
    );
  }

  // The built-in arc module library ships with the zap package;
  // `modules:` in network config overrides it.
  const bundledModules = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../arc",
  );

  const raw = parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const parsed = networkConfigSchema.parse(raw);

  // Unknown top-level keys are the network's own template vocabulary —
  // scalar strings only, available as {var} in config values.
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (NETWORK_KNOWN_KEYS.has(key)) continue;

    if (typeof value !== "string") {
      throw new Error(
        `Network config key '${key}' must be a string to serve as a {${key}} template variable.`,
      );
    }

    vars[key] = value;
  }

  return {
    name: parsed.name,
    dns: parsed.dns,
    env: parsed.env,
    backend: parsed.backend,
    providers: parsed.providers,
    moduleDefaults: parsed["module-defaults"],
    registry: parsed.registry,
    modulesDir: parsed.modules ? expandTilde(parsed.modules) : bundledModules,
    vars,
  };
}
