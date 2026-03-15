import crypto from "crypto";
import { loadState, saveState } from "../config/stateLoader";

export interface InstanceResolution {
  instanceKey: string;
  instanceId: string;
}

export const DEFAULT_INSTANCE_KEY = "default";
const INSTANCE_KEY_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;

interface InstanceEntry {
  id: string;
  ports?: Record<string, string>;
}

function resolveDefaultInstanceKey(
  explicitKey: string | undefined,
  projectRoot: string,
): string {
  if (explicitKey) return explicitKey;
  const state = loadState(projectRoot);
  const fromState = state.defaultInstance;
  if (fromState && fromState.trim().length > 0) {
    return fromState.trim();
  }
  return DEFAULT_INSTANCE_KEY;
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

export function validateInstanceKey(key: string): void {
  if (!INSTANCE_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid instance key "${key}". Instance keys must contain only lowercase letters and hyphens.`,
    );
  }
}

function getLegacyInstanceId(projectRoot: string): string | undefined {
  const state = loadState(projectRoot);
  return state.instanceId;
}

export function createInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): string {
  const resolvedInstanceKey = resolveDefaultInstanceKey(instanceKey, projectRoot);
  validateInstanceKey(resolvedInstanceKey);
  const existingState = loadState(projectRoot);
  const existing = existingState.instances?.[resolvedInstanceKey];
  if (existing?.id) {
    return existing.id;
  }

  const legacyId =
    resolvedInstanceKey === DEFAULT_INSTANCE_KEY
      ? getLegacyInstanceId(projectRoot)
      : undefined;
  const instanceId = generateInstanceId();
  const id = legacyId || instanceId;
  const nextInstances: Record<string, InstanceEntry> = {
    ...(existingState.instances || {}),
    [resolvedInstanceKey]: {
      id,
      ports:
        existingState.instances?.[resolvedInstanceKey]?.ports ||
        (resolvedInstanceKey === DEFAULT_INSTANCE_KEY
          ? existingState.ports
          : undefined),
    },
  };

  saveState(projectRoot, {
    defaultInstance: existingState.defaultInstance || resolvedInstanceKey,
    instances: nextInstances,
    // Remove legacy top-level instance identity to avoid dual sources of truth.
    instanceId: undefined,
    mode: undefined,
    // Keep legacy top-level ports for backward compatibility readers.
    ports:
      resolvedInstanceKey === DEFAULT_INSTANCE_KEY
        ? nextInstances[resolvedInstanceKey].ports || {}
        : existingState.ports,
  });
  return id;
}

// Backward-compatible alias used by older tests/callers.
export function isolateProject(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): string {
  return createInstance(projectRoot, instanceKey);
}

// Backward-compatible clear operation for the default instance.
export function clearIsolation(projectRoot: string): void {
  const state = loadState(projectRoot);
  const nextInstances = { ...(state.instances || {}) };
  delete nextInstances[DEFAULT_INSTANCE_KEY];

  saveState(projectRoot, {
    instances: nextInstances,
    instanceId: undefined,
    mode: undefined,
    ports: state.ports,
  });
}

export function ensureInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): { id: string; created: boolean } {
  const resolvedInstanceKey = resolveDefaultInstanceKey(instanceKey, projectRoot);
  validateInstanceKey(resolvedInstanceKey);
  const existing = loadState(projectRoot).instances?.[resolvedInstanceKey];
  if (existing?.id) {
    return { id: existing.id, created: false };
  }
  const id = createInstance(projectRoot, resolvedInstanceKey);
  return { id, created: true };
}

/**
 * Resolve instance configuration for the given project and key.
 */
export async function resolveInstance(
  projectRoot: string,
  instanceKey?: string,
  options: { autoCreate?: boolean } = {},
): Promise<InstanceResolution> {
  const resolvedInstanceKey = resolveDefaultInstanceKey(instanceKey, projectRoot);
  validateInstanceKey(resolvedInstanceKey);
  const state = loadState(projectRoot);

  const existing = state.instances?.[resolvedInstanceKey];
  if (existing?.id) {
    return { instanceKey: resolvedInstanceKey, instanceId: existing.id };
  }

  // Legacy compatibility: treat top-level instanceId as default instance.
  if (resolvedInstanceKey === DEFAULT_INSTANCE_KEY && state.instanceId) {
    const id = createInstance(projectRoot, resolvedInstanceKey);
    return { instanceKey: resolvedInstanceKey, instanceId: id };
  }

  if (options.autoCreate) {
    const { id } = ensureInstance(projectRoot, resolvedInstanceKey);
    return { instanceKey: resolvedInstanceKey, instanceId: id };
  }

  throw new Error(
    `Instance "${resolvedInstanceKey}" not found. Run 'zap init --instance ${resolvedInstanceKey}' to create it.`,
  );
}
