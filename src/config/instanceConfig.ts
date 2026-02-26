import { loadState, saveState } from "./stateLoader";

export interface InstanceConfig {
  instanceId?: string | null;
  mode?: "isolate" | "normal";
}

/**
 * Load instance configuration from .zap/state.json
 */
export function loadInstanceConfig(projectRoot: string): InstanceConfig | null {
  const state = loadState(projectRoot);
  if (!state.instanceId) {
    return null;
  }

  return {
    instanceId: state.instanceId,
    mode: state.mode === "isolate" ? "isolate" : "normal",
  };
}

/**
 * Save instance configuration to .zap/state.json
 */
export function saveInstanceConfig(
  projectRoot: string,
  config: InstanceConfig,
): void {
  saveState(projectRoot, {
    instanceId: config.instanceId ?? undefined,
    mode: config.instanceId ? "isolate" : "normal",
  });
}
