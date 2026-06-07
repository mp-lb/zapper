import { createRequire } from "module";
import { normalizeHostPath, HostPathContext } from "./hostPaths";

const require = createRequire(import.meta.url);

export interface RuntimeCommand {
  command: string;
  argsPrefix: string[];
  label: string;
}

export interface RuntimeAdapterContext extends HostPathContext {
  nodePath?: string;
  packageResolve?: (id: string) => string;
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

function resolvePm2FromPackage(
  args: string[],
  context: RuntimeAdapterContext,
): RuntimeCommand | null {
  const env = context.env || process.env;

  if (env.ZAPPER_PM2_USE_GLOBAL) return null;

  const resolvePackage = context.packageResolve || require.resolve;

  try {
    const command = normalizeHostPath(
      context.nodePath || process.execPath,
      context,
    );

    const pm2Entry = normalizeHostPath(resolvePackage("pm2/bin/pm2"), context);
    const argsPrefix = [pm2Entry, ...args];

    return {
      command,
      argsPrefix,
      label: commandLabel(command, argsPrefix),
    };
  } catch {
    return null;
  }
}

function resolveBundledPm2(
  args: string[],
  context: RuntimeAdapterContext,
): RuntimeCommand | null {
  return (
    resolvePm2FromEnv(args, context) || resolvePm2FromPackage(args, context)
  );
}

function createUnixAdapter(context: RuntimeAdapterContext): RuntimeAdapter {
  return {
    pm2(args) {
      return resolveBundledPm2(args, context) || directCommand("pm2", args);
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
      return resolveBundledPm2(args, context) || directCommand("pm2.cmd", args);
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
