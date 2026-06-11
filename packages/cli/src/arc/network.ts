import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { networkConfigSchema, NetworkConfig } from "./schemas";
import { loadOperatorConfig, DEFAULT_CONFIG_PATH, expandTilde } from "./config";

// The network config is the sharing seam: which GCP projects, zone, state
// bucket, and module library this arc network deploys with. Located via the
// operator config (or ZAP_ARC_NETWORK_FILE).
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

  const network = networkConfigSchema.parse(parse(readFileSync(path, "utf8")));

  return {
    ...network,
    modules: network.modules ? expandTilde(network.modules) : bundledModules,
  };
}

export function projectGcpId(
  network: NetworkConfig,
  slug: string,
  override?: string,
): string {
  if (override) return override;

  const prefix = network.gcp["project-prefix"];

  if (!prefix) {
    throw new Error(
      `Project '${slug}' needs an explicit deploy.gcp-project (no project-prefix convention configured on network '${network.name}').`,
    );
  }

  return `${prefix}-${slug}`;
}
