import { HostPathContext } from "./hostPaths";

export interface RuntimeCommand {
  command: string;
  argsPrefix: string[];
  label: string;
}

export type RuntimeAdapterContext = HostPathContext;

interface RuntimeAdapter {
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

function createUnixAdapter(): RuntimeAdapter {
  return {
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

function createMacosAdapter(): RuntimeAdapter {
  return {
    ...createUnixAdapter(),
    openUrl(url) {
      return directCommand("open", [url]);
    },
  };
}

function createWindowsAdapter(): RuntimeAdapter {
  return {
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

  if (platform === "darwin") return createMacosAdapter();
  if (platform === "win32") return createWindowsAdapter();
  return createUnixAdapter();
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
