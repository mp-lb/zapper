export interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  uptime: number;
  memory: number;
  cpu: number;
  restarts: number;
  cwd?: string;
  // Script the supervisor executes: the .zap wrapper for Zapper apps.
  script?: string;
}

export * from "./Context";

export type Command =
  | "up"
  | "down"
  | "kill"
  | "restart"
  | "watch"
  | "status"
  | "ls"
  | "logs"
  | "startup-log"
  | "reset"
  | "clone"
  | "task"
  | "profile"
  | "state"
  | "stack"
  | "git:checkout"
  | "git:pull"
  | "git:status"
  | "git:stash"
  | "config"
  | "validate"
  | "env"
  | "runtime"
  | "launch"
  | "open"
  | "links"
  | "home"
  | "notes"
  | "init"
  | "instance"
  | "volume"
  | "global"
  | "system";

export interface CliOptions {
  command: Command;
  invoked?: string;
  service?: string | string[];
  all?: boolean;
  force?: boolean;
  follow?: boolean;
  nonInteractive?: boolean;
  config?: string;
  json?: boolean;
  jsonl?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  debug?: boolean;
}
