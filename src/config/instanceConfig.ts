import { loadState, saveState } from "./stateLoader";
import { DEFAULT_INSTANCE_KEY } from "../core/instanceResolver";

export interface InstanceConfig {
  instanceId?: string | null;
  mode?: "isolate" | "normal";
}

/**
 * Load instance configuration from .zap/state.json
 */
export function loadInstanceConfig(projectRoot: string): InstanceConfig | null {
  const state = loadState(projectRoot);
  const instanceId =
    state.instances?.[DEFAULT_INSTANCE_KEY]?.id || state.instanceId;
  if (!instanceId) return null;

  return {
    instanceId,
    // Keep the legacy state value for compatibility; semantically this is just
    // "the default instance has an explicit id".
    mode: "isolate",
  };
}

/**
 * Save instance configuration to .zap/state.json
 */
export function saveInstanceConfig(
  projectRoot: string,
  config: InstanceConfig,
): void {
  const existing = loadState(projectRoot);
  const nextInstances = { ...(existing.instances || {}) };

  if (config.instanceId) {
    nextInstances[DEFAULT_INSTANCE_KEY] = {
      id: config.instanceId,
      ports:
        existing.instances?.[DEFAULT_INSTANCE_KEY]?.ports ||
        existing.ports ||
        {},
    };
  } else {
    delete nextInstances[DEFAULT_INSTANCE_KEY];
  }

  saveState(projectRoot, {
    instances: nextInstances,
    instanceId: config.instanceId ?? undefined,
    mode: config.instanceId ? "isolate" : "normal",
    ports: config.instanceId
      ? nextInstances[DEFAULT_INSTANCE_KEY]?.ports || {}
      : existing.ports,
  });
}
