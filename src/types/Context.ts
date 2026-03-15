import {
  Process as ConfigProcess,
  Container as ConfigContainer,
  Task as ConfigTask,
  TaskParam,
  Link,
  ZapperState,
} from "../config/schemas";

export type { TaskParam, Link };

// Enhanced types that include name field and other context-specific data
export interface Process extends Omit<ConfigProcess, "name"> {
  name: string; // Required in context
}

export interface Container extends Omit<ConfigContainer, "name"> {
  name: string; // Required in context
}

export interface Task extends Omit<ConfigTask, "name"> {
  name: string; // Required in context
}

// Main context object that gets passed around the application
export interface Context {
  projectName: string; // Renamed from 'project' in config
  projectRoot: string; // Absolute path to directory containing zap.yaml
  envFiles?: string[]; // Already resolved to absolute paths
  environments: string[]; // Available env file sets
  ports?: string[]; // Port names from config
  initTask?: string; // Task to run automatically after `zap init`
  gitMethod?: "http" | "ssh" | "cli";
  taskDelimiters?: [string, string]; // Custom delimiters for task interpolation
  instanceKey: string; // Selected instance key (default if unspecified)
  instanceId?: string | null; // Instance ID for worktree isolation
  instance?: {
    key: string;
    id: string;
    ports: Record<string, string>;
  };

  // Services organized by type with names included
  processes: Process[]; // Combines native and processes from config
  containers: Container[]; // Combines docker and containers from config
  tasks: Task[]; // Tasks from config
  homepage?: string; // Primary app URL for `zap launch` with no args
  notes?: string; // Top-level project notes for `zap notes`
  links: Link[]; // Project bookmarks/links
  profiles: string[]; // All unique profiles from processes and containers
  state: ZapperState; // Validated state from state.json
}
