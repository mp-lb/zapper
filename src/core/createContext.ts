import path from "path";
import { ZapperConfig } from "../config/schemas";
import { Context, Process, Container, Task, Link } from "../types/Context";
import { loadState } from "../config/stateLoader";
import { DEFAULT_INSTANCE_KEY } from "./instanceResolver";

/**
 * Creates a Context object from a ZapperConfig.
 * Transforms the config into a more usable format for the rest of the application.
 *
 * @param config The validated ZapperConfig (with whitelists already resolved)
 * @param projectRoot Absolute path to directory containing zap.yaml
 * @returns Context object ready for use throughout the application
 */
export function createContext(
  config: ZapperConfig,
  projectRoot: string,
): Context {
  // Transform processes from config format to context format
  const processes: Process[] = [];

  // Add native processes (key-value pairs)
  if (config.native) {
    for (const [name, proc] of Object.entries(config.native)) {
      processes.push({
        ...proc,
        name,
      });
    }
  }

  // Add legacy processes array (already has names)
  if (config.processes) {
    for (const proc of config.processes) {
      if (!proc.name) {
        throw new Error("Process in processes array missing name field");
      }
      processes.push({
        ...proc,
        name: proc.name,
      });
    }
  }

  // Transform containers from config format to context format
  const containers: Container[] = [];

  // Add docker containers (key-value pairs)
  const dockerServices = config.docker || config.containers;
  if (dockerServices) {
    for (const [name, container] of Object.entries(dockerServices)) {
      containers.push({
        ...container,
        name,
      });
    }
  }

  // Transform tasks from config format to context format
  const tasks: Task[] = [];
  if (config.tasks) {
    for (const [name, task] of Object.entries(config.tasks)) {
      tasks.push({
        ...task,
        name,
      });
    }
  }

  // Load and validate state from state.json
  const state = loadState(projectRoot);

  // Resolve env_files to absolute paths relative to projectRoot
  let envFiles: string[] | undefined;
  const environmentSetNames: string[] = [];
  if (config.env_files) {
    if (Array.isArray(config.env_files)) {
      if (state.activeEnvironment && state.activeEnvironment !== "default") {
        throw new Error(
          `Environment not found: ${state.activeEnvironment}. Available environments: default`,
        );
      }
      if (config.env_files.length > 0) {
        envFiles = config.env_files.map((p) =>
          path.isAbsolute(p) ? p : path.join(projectRoot, p),
        );
        environmentSetNames.push("default");
      }
    } else {
      const available = Object.keys(config.env_files).sort();
      environmentSetNames.push(...available);

      const activeName = state.activeEnvironment || "default";
      const activeEnvironment = config.env_files[activeName];

      if (!activeEnvironment && state.activeEnvironment) {
        throw new Error(
          `Environment not found: ${
            state.activeEnvironment
          }. Available environments: ${available.join(", ")}`,
        );
      }

      if (activeEnvironment) {
        envFiles = activeEnvironment.map((p) =>
          path.isAbsolute(p) ? p : path.join(projectRoot, p),
        );
      }
    }
  }

  // Extract all unique profiles from processes and containers
  const profileSet = new Set<string>();

  // Add profiles from processes
  processes.forEach((process) => {
    if (Array.isArray(process.profiles)) {
      process.profiles.forEach((profile) => profileSet.add(profile));
    }
  });

  // Add profiles from containers
  containers.forEach((container) => {
    if (Array.isArray(container.profiles)) {
      container.profiles.forEach((profile) => profileSet.add(profile));
    }
  });

  const profiles = Array.from(profileSet).sort();

  const links: Link[] = config.links ?? [];

  return {
    projectName: config.project,
    projectRoot,
    envFiles,
    environments: environmentSetNames,
    ports: config.ports,
    initTask: config.init_task,
    gitMethod: config.git_method,
    taskDelimiters: config.task_delimiters,
    instanceKey: DEFAULT_INSTANCE_KEY,
    instance: undefined,
    processes,
    containers,
    tasks,
    homepage: config.homepage,
    notes: config.notes,
    links,
    profiles,
    state,
  };
}
