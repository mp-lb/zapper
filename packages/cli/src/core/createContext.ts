import path from "path";
import { ZapperConfig } from "../config/schemas";
import { Context, Process, Container, Task, Link } from "../types/Context";
import { loadState } from "../config/stateLoader";
import { DEFAULT_INSTANCE_KEY } from "./instanceResolver";
import { listProfileNames, resolveProfile } from "./profileResolver";

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
  options: { profileName?: string } = {},
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

  const selectedProfile = resolveProfile(config, {
    projectRoot,
    profileName: options.profileName,
    selectedProfileName: state.selectedProfile,
  });

  if (selectedProfile && selectedProfile.services !== "*") {
    const selectedServices = expandServiceDependencies(
      selectedProfile.services,
      processes,
      containers,
    );
    for (let i = processes.length - 1; i >= 0; i -= 1) {
      if (!selectedServices.has(processes[i].name)) processes.splice(i, 1);
    }
    for (let i = containers.length - 1; i >= 0; i -= 1) {
      if (!selectedServices.has(containers[i].name)) containers.splice(i, 1);
    }
  }

  // Resolve root env/env_files to absolute paths relative to projectRoot
  let envFiles: string[] | undefined;
  const rootEnv = config.env ?? config.env_files;
  if (selectedProfile) {
    envFiles = selectedProfile.envFiles;
  } else if (rootEnv && rootEnv.length > 0) {
    envFiles = rootEnv.map((p) =>
      path.isAbsolute(p) ? p : path.join(projectRoot, p),
    );
  }

  const profiles = listProfileNames(config);

  const links: Link[] = config.links ?? [];

  return {
    projectName: config.project,
    projectRoot,
    envFiles,
    environments: [],
    ports: config.ports,
    initTask: config.init_task,
    gitMethod: config.git_method,
    taskDelimiters: config.task_delimiters,
    instanceKey: DEFAULT_INSTANCE_KEY,
    instance: undefined,
    processes,
    containers,
    volumes: config.volumes ?? {},
    secrets: config.secrets ?? {},
    tasks,
    homepage: config.homepage,
    notes: config.notes,
    links,
    profiles,
    profile: selectedProfile,
    state,
  };
}

function expandServiceDependencies(
  services: string[],
  processes: Process[],
  containers: Container[],
): Set<string> {
  const dependenciesByService = new Map<string, string[]>();

  for (const process of processes) {
    dependenciesByService.set(process.name, process.depends_on ?? []);
  }
  for (const container of containers) {
    dependenciesByService.set(container.name, container.depends_on ?? []);
  }

  const selectedServices = new Set<string>();
  const toVisit = [...services];

  while (toVisit.length > 0) {
    const service = toVisit.pop()!;
    if (selectedServices.has(service)) continue;

    selectedServices.add(service);
    for (const dependency of dependenciesByService.get(service) ?? []) {
      if (!selectedServices.has(dependency)) toVisit.push(dependency);
    }
  }

  return selectedServices;
}
