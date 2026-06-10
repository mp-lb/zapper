import fs from "fs";
import { Zapper } from "../core/Zapper";
import { getServiceList, ServiceListResult } from "../core/getServiceList";
import { DockerManager } from "../core/docker/DockerManager";
import { Pm2Manager } from "../core/process/Pm2Manager";
import { parseServiceName } from "../utils/nameBuilder";
import { loadSystemRegistry, SystemRegistryProject } from "./SystemRegistry";
import { OrphanScanner } from "./OrphanScanner";

export type SystemProjectState = "active" | "inactive" | "stale" | "unresolved";

export interface SystemProjectInstanceStatus {
  instanceKey: string;
  instanceId: string;
  label?: string;
  list?: ServiceListResult;
  error?: string;
}

export interface SystemProjectStatus {
  registryId: string;
  project: string;
  projectRoot: string;
  configPath: string;
  state: SystemProjectState;
  lastSeenAt: string;
  lastCommand?: string;
  instances: SystemProjectInstanceStatus[];
  error?: string;
}

export type SystemResourceType = "pm2" | "container" | "volume" | "process";
export type SystemResourceClassification =
  | "dangling"
  | "legacy"
  | "live-unregistered"
  | "ambiguous";

export interface SystemResourceAuditEntry {
  type: SystemResourceType;
  name: string;
  project?: string;
  instanceId?: string;
  service?: string;
  classification: SystemResourceClassification;
  location: string;
  reason: string;
  // OS process ID, set for "process" entries (orphans PM2 no longer manages).
  pid?: number;
}

export interface SystemResourceAuditResult {
  resources: SystemResourceAuditEntry[];
}

function projectIsActive(instances: SystemProjectInstanceStatus[]): boolean {
  return instances.some((instance) =>
    instance.list?.services.some((service) => service.status !== "down"),
  );
}

async function loadProjectInstance(
  project: SystemRegistryProject,
  instanceKey: string,
): Promise<SystemProjectInstanceStatus> {
  const registryInstance = project.instances[instanceKey];
  const instanceId = registryInstance?.id || "";

  const profileOption =
    instanceKey === "default" ? {} : { profile: instanceKey };

  try {
    const zapper = new Zapper();
    await zapper.loadConfig(project.configPath, {
      __command: "system",
      __skipSystemRegistryTouch: true,
      ...profileOption,
      instance: instanceKey,
    });

    const context = zapper.getContext();
    if (!context) throw new Error("Project context did not load");
    return {
      instanceKey: context.instanceKey,
      instanceId: context.instanceId || instanceId,
      label: context.instance?.label ?? registryInstance?.label,
      list: await getServiceList(context),
    };
  } catch (error) {
    return {
      instanceKey,
      instanceId,
      label: registryInstance?.label,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getSystemProjects(): Promise<SystemProjectStatus[]> {
  const registry = loadSystemRegistry();
  const results: SystemProjectStatus[] = [];

  for (const project of Object.values(registry.projects).sort((a, b) =>
    a.project.localeCompare(b.project),
  )) {
    if (
      !fs.existsSync(project.projectRoot) ||
      !fs.existsSync(project.configPath)
    ) {
      results.push({
        registryId: project.registryId,
        project: project.project,
        projectRoot: project.projectRoot,
        configPath: project.configPath,
        state: "stale",
        lastSeenAt: project.lastSeenAt,
        lastCommand: project.lastCommand,
        instances: [],
        error: "Project root or config path no longer exists",
      });

      continue;
    }

    const instanceKeys = Object.keys(project.instances);

    const instances = await Promise.all(
      (instanceKeys.length > 0 ? instanceKeys : ["default"]).map((key) =>
        loadProjectInstance(project, key),
      ),
    );

    const unresolved = instances.every((instance) => instance.error);

    results.push({
      registryId: project.registryId,
      project: project.project,
      projectRoot: project.projectRoot,
      configPath: project.configPath,
      state: unresolved
        ? "unresolved"
        : projectIsActive(instances)
          ? "active"
          : "inactive",
      lastSeenAt: project.lastSeenAt,
      lastCommand: project.lastCommand,
      instances,
      error: unresolved ? "Project could not be loaded" : undefined,
    });
  }

  return results;
}

function parseManagedVolumeName(
  name: string,
): { project: string; instanceId: string } | null {
  const parts = name.split(".");
  if (parts.length !== 4) return null;
  if (parts[0] !== "zap" || !/^vol\d+$/.test(parts[3])) return null;
  return { project: parts[1], instanceId: parts[2] };
}

function buildRegistryIndex(projects: SystemProjectStatus[]): {
  projectNames: Set<string>;
  instanceIds: Set<string>;
  projectInstanceKeys: Set<string>;
  loadedInstanceKeys: Set<string>;
  serviceKeys: Set<string>;
  projectLocations: Map<string, string>;
  instanceLocations: Map<string, string>;
} {
  const projectNames = new Set<string>();
  const instanceIds = new Set<string>();
  const projectInstanceKeys = new Set<string>();
  const loadedInstanceKeys = new Set<string>();
  const serviceKeys = new Set<string>();
  const projectLocations = new Map<string, string>();
  const instanceLocations = new Map<string, string>();

  for (const project of projects) {
    projectNames.add(project.project);
    projectLocations.set(project.project, project.projectRoot);

    for (const instance of project.instances) {
      if (instance.instanceId) {
        instanceIds.add(instance.instanceId);
        projectInstanceKeys.add(`${project.project}:${instance.instanceId}`);
        instanceLocations.set(
          `${project.project}:${instance.instanceId}`,
          `${project.projectRoot} (${instance.instanceKey})`,
        );

        // Only instances whose config actually loaded can tell us which
        // services are current. An instance that failed to load (no `list`)
        // must not be used to judge a live resource as dangling.
        if (instance.list) {
          loadedInstanceKeys.add(`${project.project}:${instance.instanceId}`);
        }
      }

      for (const service of instance.list?.services || []) {
        serviceKeys.add(
          `${project.project}:${instance.instanceId}:${service.service}`,
        );
      }
    }
  }

  return {
    projectNames,
    instanceIds,
    projectInstanceKeys,
    loadedInstanceKeys,
    serviceKeys,
    projectLocations,
    instanceLocations,
  };
}

function resourceNameLocation(data: {
  project: string;
  instanceId?: string;
  service?: string;
}): string {
  return [
    data.project,
    data.instanceId ? `instance ${data.instanceId}` : undefined,
    data.service,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" / ");
}

function registryProjectLocation(
  project: string,
  index: ReturnType<typeof buildRegistryIndex>,
): string {
  return index.projectLocations.get(project) || project;
}

function registryInstanceLocation(
  project: string,
  instanceId: string,
  index: ReturnType<typeof buildRegistryIndex>,
): string {
  return (
    index.instanceLocations.get(`${project}:${instanceId}`) ||
    `${registryProjectLocation(project, index)} / instance ${instanceId}`
  );
}

function classifyServiceResource(
  type: "pm2" | "container",
  name: string,
  index: ReturnType<typeof buildRegistryIndex>,
): SystemResourceAuditEntry | null {
  const parsed = parseServiceName(name);
  if (!parsed) return null;

  if (!parsed.instanceId) {
    return {
      type,
      name,
      project: parsed.project,
      service: parsed.service,
      classification: "legacy",
      location: resourceNameLocation({
        project: parsed.project,
        service: parsed.service,
      }),
      reason: "Resource uses legacy name without an instance ID",
    };
  }

  if (!index.projectNames.has(parsed.project)) {
    return {
      type,
      name,
      project: parsed.project,
      instanceId: parsed.instanceId,
      service: parsed.service,
      classification: "live-unregistered",
      location: resourceNameLocation(parsed),
      reason: "No registered project matches this resource name",
    };
  }

  if (!index.instanceIds.has(parsed.instanceId)) {
    return {
      type,
      name,
      project: parsed.project,
      instanceId: parsed.instanceId,
      service: parsed.service,
      classification: "live-unregistered",
      location: `${registryProjectLocation(parsed.project, index)} / instance ${parsed.instanceId} / ${parsed.service}`,
      reason: "Project is registered, but this instance ID is unknown",
    };
  }

  if (
    !index.serviceKeys.has(
      `${parsed.project}:${parsed.instanceId}:${parsed.service}`,
    )
  ) {
    // Without a successful project load we cannot know the current service
    // list, so we must not declare a live, running resource dangling: doing so
    // would let `global prune` delete the real resources of a project that is
    // merely failing to load right now (bad config, missing dep, mid-edit).
    if (
      !index.loadedInstanceKeys.has(`${parsed.project}:${parsed.instanceId}`)
    ) {
      return null;
    }

    return {
      type,
      name,
      project: parsed.project,
      instanceId: parsed.instanceId,
      service: parsed.service,
      classification: "dangling",
      location: `${registryInstanceLocation(parsed.project, parsed.instanceId, index)} / ${parsed.service}`,
      reason: "Service is not in the current registered project config",
    };
  }

  return null;
}

function classifyVolumeResource(
  name: string,
  index: ReturnType<typeof buildRegistryIndex>,
): SystemResourceAuditEntry | null {
  const parsed = parseManagedVolumeName(name);
  if (!parsed) return null;

  if (!index.projectNames.has(parsed.project)) {
    return {
      type: "volume",
      name,
      project: parsed.project,
      instanceId: parsed.instanceId,
      classification: "live-unregistered",
      location: resourceNameLocation(parsed),
      reason: "No registered project matches this generated volume",
    };
  }

  if (
    !index.projectInstanceKeys.has(`${parsed.project}:${parsed.instanceId}`)
  ) {
    return {
      type: "volume",
      name,
      project: parsed.project,
      instanceId: parsed.instanceId,
      classification: "dangling",
      location: `${registryProjectLocation(parsed.project, index)} / instance ${parsed.instanceId}`,
      reason: "Generated volume belongs to an unknown instance ID",
    };
  }

  return null;
}

// A PM2 entry whose recorded working directory is gone belongs to a deleted
// checkout/instance dir. PM2 keeps running (or endlessly restarting) it, so it
// must be pruned regardless of what the registry says about its name.
function classifyMissingCwdProcess(process: {
  name: string;
  cwd?: string;
}): SystemResourceAuditEntry | null {
  if (!process.cwd || fs.existsSync(process.cwd)) return null;
  const parsed = parseServiceName(process.name);
  if (!parsed) return null;

  return {
    type: "pm2",
    name: process.name,
    project: parsed.project,
    instanceId: parsed.instanceId,
    service: parsed.service,
    classification: "dangling",
    location: process.cwd,
    reason: "Process working directory no longer exists",
  };
}

// Survivors of a PM2 daemon crash: OS processes still running a Zapper wrapper
// script that no longer exists on disk (its checkout/instance dir was deleted).
// PM2 does not know about them, so they are found by scanning OS processes.
function classifyOrphanWrapperProcesses(
  pm2Processes: Array<{ pid: number }>,
): SystemResourceAuditEntry[] {
  const managedPids = new Set(pm2Processes.map((process) => process.pid));

  return OrphanScanner.listWrapperProcesses()
    .filter(
      (wrapper) =>
        !managedPids.has(wrapper.pid) && !fs.existsSync(wrapper.scriptPath),
    )
    .map((wrapper) => ({
      type: "process" as const,
      name: `pid ${wrapper.pid}`,
      classification: "dangling" as const,
      location: wrapper.scriptPath,
      reason: "Wrapper script and its instance directory no longer exist",
      pid: wrapper.pid,
    }));
}

export async function auditSystemResources(): Promise<SystemResourceAuditResult> {
  const [projects, pm2Processes, dockerContainers, dockerVolumes] =
    await Promise.all([
      getSystemProjects(),
      Pm2Manager.listProcesses(),
      DockerManager.listContainers(),
      DockerManager.listVolumes(),
    ]);

  const index = buildRegistryIndex(projects);
  const resources: SystemResourceAuditEntry[] = [];

  for (const process of pm2Processes) {
    const entry =
      classifyMissingCwdProcess(process) ??
      classifyServiceResource("pm2", process.name, index);

    if (entry) resources.push(entry);
  }

  resources.push(...classifyOrphanWrapperProcesses(pm2Processes));

  for (const container of dockerContainers) {
    const entry = classifyServiceResource("container", container.name, index);
    if (entry) resources.push(entry);
  }

  for (const volume of dockerVolumes) {
    const entry = classifyVolumeResource(volume.name, index);
    if (entry) resources.push(entry);
  }

  return {
    resources: resources.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function cleanupSystemResources(options: {
  includeVolumes?: boolean;
}): Promise<SystemResourceAuditResult> {
  const audit = await auditSystemResources();

  const resources = audit.resources.filter(
    (resource) => options.includeVolumes || resource.type !== "volume",
  );

  for (const resource of resources) {
    if (resource.type === "pm2") {
      await Pm2Manager.deleteProcess(resource.name);
    } else if (resource.type === "container") {
      await DockerManager.removeContainer(resource.name);
    } else if (resource.type === "volume") {
      await DockerManager.removeVolume(resource.name);
    } else if (resource.type === "process" && resource.pid) {
      Pm2Manager.killDetachedProcessTree(resource.pid);
    }
  }

  return { resources };
}
