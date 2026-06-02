import path from "path";
import { ZapperConfig, StackProfile } from "../config/schemas";

export const DEFAULT_PROFILE_NAME = "default";

export type ProfileServices = "*" | string[];

export interface ResolvedProfile {
  name: string;
  envFiles: string[];
  services: ProfileServices;
  isolate: boolean;
}

export interface ResolveProfileOptions {
  projectRoot: string;
  profileName?: string;
  selectedProfileName?: string;
}

export function resolveProfile(
  config: ZapperConfig,
  options: ResolveProfileOptions,
): ResolvedProfile | undefined {
  if (!config.profiles) return undefined;

  const availableProfiles = Object.keys(config.profiles).sort();

  const profileName =
    options.profileName ?? options.selectedProfileName ?? DEFAULT_PROFILE_NAME;

  const profile = config.profiles[profileName];

  if (!profile) {
    throw new Error(
      `Profile not found: ${profileName}. Available profiles: ${availableProfiles.join(", ")}`,
    );
  }

  validateProfileServices(
    profileName,
    profile,
    getConfiguredServiceNames(config),
  );

  return {
    name: profileName,
    envFiles: resolveEnvFilePaths(profile.env_files, options.projectRoot),
    services: normalizeProfileServices(profile.services),
    isolate: profile.isolate,
  };
}

export function listProfileNames(config: ZapperConfig): string[] {
  return Object.keys(config.profiles ?? {}).sort();
}

export function getConfiguredServiceNames(config: ZapperConfig): string[] {
  const names = new Set<string>();

  for (const name of Object.keys(config.native ?? {})) {
    names.add(name);
  }

  for (const name of Object.keys(config.docker ?? config.containers ?? {})) {
    names.add(name);
  }

  for (const proc of config.processes ?? []) {
    if (proc.name) names.add(proc.name);
  }

  return Array.from(names).sort();
}

export function resolveEnvFilePaths(
  envFiles: string[],
  projectRoot: string,
): string[] {
  return envFiles.map((filePath) =>
    path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath),
  );
}

function normalizeProfileServices(services: StackProfile["services"]) {
  return services === "*" ? services : [...services];
}

function validateProfileServices(
  profileName: string,
  profile: StackProfile,
  configuredServices: string[],
): void {
  if (profile.services === "*") return;

  const configured = new Set(configuredServices);

  const missing = profile.services.filter(
    (service) => !configured.has(service),
  );

  if (missing.length > 0) {
    throw new Error(
      `Profile "${profileName}" references unknown service(s): ${missing.join(", ")}`,
    );
  }
}
