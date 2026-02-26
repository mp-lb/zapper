import crypto from "crypto";
import { loadState, saveState } from "../config/stateLoader";

export interface InstanceResolution {
  instanceId?: string | null;
  mode: "normal" | "isolate";
}

/**
 * Generate a short random instance ID.
 */
function generateInstanceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let instanceId = "";

  for (let i = 0; i < 6; i += 1) {
    instanceId += chars[crypto.randomInt(0, chars.length)];
  }

  return instanceId;
}

export function isolateProject(
  projectRoot: string,
): string {
  const existingState = loadState(projectRoot);
  if (existingState.instanceId) {
    saveState(projectRoot, {
      mode: "isolate",
    });
    return existingState.instanceId;
  }

  const instanceId = generateInstanceId();
  saveState(projectRoot, {
    instanceId,
    mode: "isolate",
  });
  return instanceId;
}

export function clearIsolation(projectRoot: string): void {
  saveState(projectRoot, {
    instanceId: undefined,
    mode: "normal",
  });
}

/**
 * Resolve instance configuration for the given project.
 * Handles worktree detection and warning behavior.
 */
export async function resolveInstance(
  projectRoot: string,
): Promise<InstanceResolution> {
  const state = loadState(projectRoot);
  if (state.instanceId) {
    return {
      instanceId: state.instanceId,
      mode: "isolate",
    };
  }

  return { mode: "normal" };
}
