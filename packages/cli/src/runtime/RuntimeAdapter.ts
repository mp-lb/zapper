import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";

export interface RuntimeCommand {
  command: string;
  argsPrefix: string[];
  label: string;
}

export interface RuntimeAdapterContext {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  procVersionPath?: string;
  execFileSync?: typeof execFileSync;
}

interface RuntimeAdapter {
  pm2(args: string[]): RuntimeCommand;
  docker(args: string[]): RuntimeCommand;
  brew(args: string[]): RuntimeCommand;
  tail(args: string[]): RuntimeCommand;
  bash(args: string[]): RuntimeCommand;
  openUrl(url: string): RuntimeCommand;
}

function commandLabel(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function directCommand(command: string, args: string[]): RuntimeCommand {
  return {
    command,
    argsPrefix: args,
    label: commandLabel(command, args),
  };
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function fallbackWslPath(value: string): string {
  const drive = value[0]?.toLowerCase();
  const rest = value.slice(2).replace(/\\/g, "/").replace(/^\/+/, "");
  return `/mnt/${drive}/${rest}`;
}

function isWsl(context: RuntimeAdapterContext): boolean {
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

function normalizeWslPath(
  value: string,
  context: RuntimeAdapterContext,
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

function normalizeHostPath(
  value: string,
  context: RuntimeAdapterContext,
): string {
  if (!isWsl(context)) return value;
  return normalizeWslPath(value, context);
}

function resolvePm2FromEnv(
  args: string[],
  context: RuntimeAdapterContext,
): RuntimeCommand | null {
  const env = context.env || process.env;
  const node = env.ZAPPER_NODE;
  const pm2 = env.ZAPPER_PM2_JS;

  if (!node || !pm2) return null;

  const command = normalizeHostPath(node, context);
  const pm2Entry = normalizeHostPath(pm2, context);
  const argsPrefix = [pm2Entry, ...args];

  return {
    command,
    argsPrefix,
    label: commandLabel(command, argsPrefix),
  };
}

function createUnixAdapter(context: RuntimeAdapterContext): RuntimeAdapter {
  return {
    pm2(args) {
      return resolvePm2FromEnv(args, context) || directCommand("pm2", args);
    },
    docker(args) {
      return directCommand("docker", args);
    },
    brew(args) {
      return directCommand("brew", args);
    },
    tail(args) {
      return directCommand("tail", args);
    },
    bash(args) {
      return directCommand("/bin/bash", args);
    },
    openUrl(url) {
      return directCommand("xdg-open", [url]);
    },
  };
}

function createMacosAdapter(context: RuntimeAdapterContext): RuntimeAdapter {
  return {
    ...createUnixAdapter(context),
    openUrl(url) {
      return directCommand("open", [url]);
    },
  };
}

function createWindowsAdapter(context: RuntimeAdapterContext): RuntimeAdapter {
  return {
    pm2(args) {
      return resolvePm2FromEnv(args, context) || directCommand("pm2.cmd", args);
    },
    docker(args) {
      return directCommand("docker", args);
    },
    brew(args) {
      return directCommand("brew", args);
    },
    tail(args) {
      return directCommand("tail", args);
    },
    bash(args) {
      return directCommand("bash", args);
    },
    openUrl(url) {
      return directCommand("cmd", ["/c", "start", "", url]);
    },
  };
}

export function getRuntimeAdapter(
  context: RuntimeAdapterContext = {},
): RuntimeAdapter {
  const platform = context.platform || process.platform;

  if (platform === "darwin") return createMacosAdapter(context);
  if (platform === "win32") return createWindowsAdapter(context);
  return createUnixAdapter(context);
}

export function resolvePm2Runtime(
  args: string[],
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).pm2(args);
}

export function resolveDockerRuntime(
  args: string[],
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).docker(args);
}

export function resolveBrewRuntime(
  args: string[],
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).brew(args);
}

export function resolveTailRuntime(
  args: string[],
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).tail(args);
}

export function resolveBashRuntime(
  args: string[],
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).bash(args);
}

export function resolveOpenUrlRuntime(
  url: string,
  context: RuntimeAdapterContext = {},
): RuntimeCommand {
  return getRuntimeAdapter(context).openUrl(url);
}
