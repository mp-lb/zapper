/**
 * Config Normalizer
 *
 * Provides a mapping layer to normalize config keys to their canonical names.
 * This keeps backward compatibility opaque to the rest of the system.
 *
 * Two things happen here:
 *
 * 1. Casing — our YAML standard is kebab-case (`env-files`, `depends-on`),
 *    but the schema and the rest of the codebase use snake_case canonically.
 *    Every multi-word config key may be written in either casing; we rewrite
 *    the kebab variants to their snake_case canonical form before validation.
 *    Only known config keys are aliased, so user-chosen names (process,
 *    container, task, volume, secret, profile names, build args, task vars)
 *    are never rewritten.
 *
 * 2. Legacy keys — `bare_metal` -> `native` (YAML config key).
 */

export interface RawConfig {
  project?: string;
  env_files?: string[] | Record<string, string[]>;
  profiles?: Record<string, unknown>;
  git_method?: "http" | "ssh" | "cli";
  init_task?: string;
  whitelists?: Record<string, string[]>;
  native?: Record<string, unknown>;
  bare_metal?: Record<string, unknown>;
  docker?: Record<string, unknown>;
  containers?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  processes?: unknown[];
  tasks?: Record<string, unknown>;
  homepage?: string;
  notes?: string;
  links?: Array<{ name: string; url: string }>;
}

// Multi-word config keys, in kebab-case -> snake_case canonical form.
const KEBAB_KEY_ALIASES: Record<string, string> = {
  "env-files": "env_files",
  "init-task": "init_task",
  "git-method": "git_method",
  "task-delimiters": "task_delimiters",
  "depends-on": "depends_on",
  "internal-dir": "internal_dir",
  "read-only": "read_only",
};

// Config keys whose children are keyed by user-chosen names. We must not treat
// those child keys as config keys (so a process literally named "read-only"
// survives), but we still normalize the config objects nested inside them.
const USER_KEYED_FIELDS = new Set([
  "native",
  "bare_metal",
  "docker",
  "containers",
  "tasks",
  "volumes",
  "secrets",
  "profiles",
  "args",
  "vars",
]);

/**
 * Recursively rewrite kebab-case config keys to their snake_case canonical
 * form. `renameKeys` is false when the current object's keys are user-chosen
 * names rather than config keys.
 */
function normalizeKeyCasing(value: unknown, renameKeys: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKeyCasing(item, true));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  const sourceKeys: Record<string, string> = {};

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const canonical =
      renameKeys && KEBAB_KEY_ALIASES[key] ? KEBAB_KEY_ALIASES[key] : key;

    // Both casings of the same config key present (e.g. depends-on + depends_on).
    if (
      Object.prototype.hasOwnProperty.call(sourceKeys, canonical) &&
      sourceKeys[canonical] !== key
    ) {
      throw new Error(
        `Config key '${key}' conflicts with '${sourceKeys[canonical]}'; use one casing, not both.`,
      );
    }

    sourceKeys[canonical] = key;
    result[canonical] = normalizeKeyCasing(
      child,
      !USER_KEYED_FIELDS.has(canonical),
    );
  }

  return result;
}

export function normalizeConfig<T extends RawConfig>(config: T): T {
  if (!config) return config;

  const normalized = normalizeKeyCasing(config, true) as T;

  // Map bare_metal -> native (bare_metal takes precedence for backward compat)
  if (normalized.bare_metal && !normalized.native) {
    normalized.native = normalized.bare_metal;
  }

  // Remove legacy key after normalization
  delete normalized.bare_metal;

  return normalized as T;
}

export function denormalizeConfig<T extends RawConfig>(config: T): T {
  // For serialization back to YAML, we always use the new 'native' key
  // This function exists if we ever need to convert back to legacy format
  return config;
}
