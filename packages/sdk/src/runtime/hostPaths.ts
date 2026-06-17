import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

export interface HostPathContext {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  procVersionPath?: string;
  execFileSync?: typeof execFileSync;
}

export function isWsl(context: HostPathContext = {}): boolean {
  if ((context.platform || process.platform) !== "linux") return false;
  const env = context.env || process.env;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;

  try {
    const versionPath = context.procVersionPath || "/proc/version";
    if (!existsSync(versionPath)) return false;
    return /microsoft|wsl/i.test(readFileSync(versionPath, "utf8"));
  } catch {
    return false;
  }
}

export function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function fallbackWslPath(value: string): string {
  const drive = value[0]?.toLowerCase();
  const rest = value.slice(2).replace(/\\/g, "/").replace(/^\/+/, "");
  return `/mnt/${drive}/${rest}`;
}

export function normalizeWslHostPath(
  value: string,
  context: HostPathContext = {},
): string {
  if (!isWindowsAbsolutePath(value)) return value;

  const runExecFileSync = context.execFileSync || execFileSync;

  try {
    return runExecFileSync("wslpath", ["-u", value], {
      encoding: "utf8",
    }).trim();
  } catch {
    return fallbackWslPath(value);
  }
}

export function normalizeHostPath(
  value: string,
  context: HostPathContext = {},
): string {
  if (!isWsl(context)) return value;
  return normalizeWslHostPath(value, context);
}

export function resolveHostPath(
  projectRoot: string,
  value: string,
  context: HostPathContext = {},
): string {
  const normalized = normalizeHostPath(value, context);
  if (isWindowsAbsolutePath(normalized)) return normalized;
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(projectRoot, normalized);
}
