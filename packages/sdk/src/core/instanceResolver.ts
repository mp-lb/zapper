import crypto from "crypto";
import { StoredVolume } from "../config/schemas";
import { loadState, updateState } from "../config/stateLoader";

export interface InstanceResolution {
  instanceKey: string;
  instanceId: string;
  label?: string;
}

export const DEFAULT_INSTANCE_KEY = "default";
export const MAX_INSTANCE_LABEL_LENGTH = 100;
const INSTANCE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface InstanceEntry {
  id: string;
  label?: string;
  ports?: Record<string, string>;
  volumes?: Record<string, StoredVolume>;
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
      `Invalid instance key "${key}". Instance keys must contain only lowercase letters, numbers, and hyphens.`,
    );
  }
}

export function validateInstanceLabel(label: string): void {
  if (label.length > MAX_INSTANCE_LABEL_LENGTH) {
    throw new Error(
      `Instance label cannot exceed ${MAX_INSTANCE_LABEL_LENGTH} characters.`,
    );
  }
}

export function getInstanceDisplayLabel(instance: {
  id: string;
  label?: string;
}): string {
  return instance.label ?? instance.id;
}

export function createInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): string {
  const resolvedInstanceKey = resolveDefaultInstanceKey(
    instanceKey,
    projectRoot,
  );

  validateInstanceKey(resolvedInstanceKey);
  let resolvedId = "";

  updateState(projectRoot, (existingState) => {
    const existing = existingState.instances?.[resolvedInstanceKey];

    if (existing?.id) {
      resolvedId = existing.id;
      return {};
    }

    const legacyId =
      resolvedInstanceKey === DEFAULT_INSTANCE_KEY
        ? existingState.instanceId
        : undefined;

    resolvedId = legacyId || generateInstanceId();

    const nextInstances: Record<string, InstanceEntry> = {
      ...(existingState.instances || {}),
      [resolvedInstanceKey]: {
        id: resolvedId,
        ports:
          existingState.instances?.[resolvedInstanceKey]?.ports ||
          (resolvedInstanceKey === DEFAULT_INSTANCE_KEY
            ? existingState.ports
            : undefined),
      },
    };

    return {
      defaultInstance: existingState.defaultInstance || resolvedInstanceKey,
      instances: nextInstances,
      // Remove legacy top-level instance identity to avoid dual sources of truth.
      instanceId: undefined,
      mode: undefined,
      ports: undefined,
    };
  });

  return resolvedId;
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
  updateState(projectRoot, (state) => {
    const nextInstances = { ...(state.instances || {}) };
    delete nextInstances[DEFAULT_INSTANCE_KEY];

    return {
      instances: nextInstances,
      instanceId: undefined,
      mode: undefined,
      ports: undefined,
    };
  });
}

export function ensureInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): { id: string; created: boolean } {
  const resolvedInstanceKey = resolveDefaultInstanceKey(
    instanceKey,
    projectRoot,
  );

  validateInstanceKey(resolvedInstanceKey);
  const existing = loadState(projectRoot).instances?.[resolvedInstanceKey];

  if (existing?.id) {
    return { id: existing.id, created: false };
  }

  const id = createInstance(projectRoot, resolvedInstanceKey);
  return { id, created: true };
}

export function setInstanceLabel(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
  label: string,
): { instanceKey: string; instanceId: string; label: string } {
  validateInstanceLabel(label);

  const resolvedInstanceKey = resolveDefaultInstanceKey(
    instanceKey,
    projectRoot,
  );

  validateInstanceKey(resolvedInstanceKey);
  const { id } = ensureInstance(projectRoot, resolvedInstanceKey);

  updateState(projectRoot, (state) => {
    const existing = state.instances?.[resolvedInstanceKey];
    return {
      instances: {
        ...(state.instances || {}),
        [resolvedInstanceKey]: {
          ...existing,
          id,
          label,
        },
      },
    };
  });

  return { instanceKey: resolvedInstanceKey, instanceId: id, label };
}

/**
 * Resolve instance configuration for the given project and key.
 */
export async function resolveInstance(
  projectRoot: string,
  instanceKey?: string,
  options: { autoCreate?: boolean; allowMissing?: boolean } = {},
): Promise<InstanceResolution> {
  const resolvedInstanceKey = resolveDefaultInstanceKey(
    instanceKey,
    projectRoot,
  );

  validateInstanceKey(resolvedInstanceKey);
  const state = loadState(projectRoot);

  const existing = state.instances?.[resolvedInstanceKey];

  if (existing?.id) {
    return {
      instanceKey: resolvedInstanceKey,
      instanceId: existing.id,
      label: existing.label,
    };
  }

  // Legacy compatibility: treat top-level instanceId as default instance.
  if (resolvedInstanceKey === DEFAULT_INSTANCE_KEY && state.instanceId) {
    const id = createInstance(projectRoot, resolvedInstanceKey);
    return { instanceKey: resolvedInstanceKey, instanceId: id };
  }

  if (options.autoCreate) {
    const { id } = ensureInstance(projectRoot, resolvedInstanceKey);
    const instance = loadState(projectRoot).instances?.[resolvedInstanceKey];
    return {
      instanceKey: resolvedInstanceKey,
      instanceId: id,
      label: instance?.label,
    };
  }

  if (options.allowMissing) {
    return {
      instanceKey: resolvedInstanceKey,
      instanceId: "",
    };
  }

  throw new Error(
    `Instance "${resolvedInstanceKey}" not found. Run 'zap init --instance ${resolvedInstanceKey}' to create it.`,
  );
}
