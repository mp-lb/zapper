export interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  uptime: number;
  memory: number;
  cpu: number;
  restarts: number;
  cwd?: string;
}

export * from "./Context";

export type Command =
  | "up"
  | "down"
  | "kill"
  | "restart"
  | "status"
  | "ls"
  | "logs"
  | "startup-log"
  | "reset"
  | "clone"
  | "task"
  | "profile"
  | "environment"
  | "state"
  | "git:checkout"
  | "git:pull"
  | "git:status"
  | "git:stash"
  | "config"
  | "env"
  | "launch"
  | "links"
  | "home"
  | "notes"
  | "init"
  | "global";

export interface CliOptions {
  command: Command;
  invoked?: string;
  service?: string | string[];
  all?: boolean;
  force?: boolean;
  follow?: boolean;
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  debug?: boolean;
}
