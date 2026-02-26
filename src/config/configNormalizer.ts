/**
 * Config Normalizer
 *
 * Provides a mapping layer to normalize legacy config keys to their canonical names.
 * This keeps backward compatibility opaque to the rest of the system.
 *
 * Legacy mappings:
 * - bare_metal -> native (YAML config key)
 */

export interface RawConfig {
  project?: string;
  env_files?: string[] | Record<string, string[]>;
  git_method?: "http" | "ssh" | "cli";
  whitelists?: Record<string, string[]>;
  native?: Record<string, unknown>;
  bare_metal?: Record<string, unknown>;
  docker?: Record<string, unknown>;
  containers?: Record<string, unknown>;
  processes?: unknown[];
  tasks?: Record<string, unknown>;
  homepage?: string;
  links?: Array<{ name: string; url: string }>;
}

export function normalizeConfig<T extends RawConfig>(config: T): T {
  if (!config) return config;

  const normalized = { ...config };

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
