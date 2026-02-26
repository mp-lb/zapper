import crypto from "crypto";
import { detectWorktree } from "../utils/worktreeDetector";
import { renderer } from "../ui/renderer";
import {
  loadInstanceConfig,
  saveInstanceConfig,
  InstanceConfig,
} from "../config/instanceConfig";

export interface InstanceResolution {
  instanceId?: string | null;
  mode: "normal" | "isolate";
}

export interface ResolveInstanceOptions {
  suppressUnisolatedWorktreeWarning?: boolean;
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

function printUnisolatedWorktreeWarning(): void {
  renderer.warnings.printUnisolatedWorktree();
}

export function isolateProject(
  projectRoot: string,
  requestedInstanceId?: string,
): string {
  if (requestedInstanceId) {
    const config: InstanceConfig = {
      instanceId: requestedInstanceId,
      mode: "isolate",
    };
    saveInstanceConfig(projectRoot, config);
    return requestedInstanceId;
  }

  const existingConfig = loadInstanceConfig(projectRoot);
  if (existingConfig?.instanceId) {
    return existingConfig.instanceId;
  }

  const instanceId = generateInstanceId();
  const config: InstanceConfig = {
    instanceId,
    mode: "isolate",
  };
  saveInstanceConfig(projectRoot, config);
  return instanceId;
}

/**
 * Resolve instance configuration for the given project.
 * Handles worktree detection and warning behavior.
 */
export async function resolveInstance(
  projectRoot: string,
  options: ResolveInstanceOptions = {},
): Promise<InstanceResolution> {
  // 1. Check for existing configuration
  const existingConfig = loadInstanceConfig(projectRoot);
  if (existingConfig?.instanceId) {
    return {
      instanceId: existingConfig.instanceId,
      mode: "isolate",
    };
  }

  // 2. Check if we're in a worktree
  const worktreeInfo = detectWorktree(projectRoot);
  if (!worktreeInfo.isWorktree) {
    return { mode: "normal" };
  }

  // 3. Warn and continue in non-isolated mode
  if (!options.suppressUnisolatedWorktreeWarning) {
    printUnisolatedWorktreeWarning();
  }

  return { mode: "normal" };
}
