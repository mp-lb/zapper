import { Context } from "../types/Context";
import { getStatus } from "./getStatus";
import { loadPortsForInstance } from "../config/portsManager";
import {
  collectManagedVolumeSpecs,
  getContainerVolumeBindings,
  loadVolumesForInstance,
} from "../config/volumeManager";
import { DockerManager } from "./docker";
import { NativeProcessManager } from "./process/NativeProcessManager";
import { parseServiceName } from "../utils/nameBuilder";
import { resolveServiceTargets } from "../utils/serviceAliases";
import { StoredVolume } from "../config/schemas";
import { formatDockerCommand } from "../config/dockerCommand";

export interface ServiceListEntry {
  type: "native" | "docker";
  service: string;
  status: "down" | "pending" | "up";
  enabled: boolean;
  ports: string[];
  volumes: string[];
  cwd?: string;
  cmd: string;
}

export interface ServiceListResult {
  services: ServiceListEntry[];
  ports: PortListEntry[];
  resources?: ResourceInventory;
}

export interface PortListEntry {
  name: string;
  value: string;
}

export interface ResourceInventory {
  instances: InstanceResourceInventory[];
  alien: ResourceInventoryEntry[];
  dangling: ResourceInventoryEntry[];
  staleVolumes: StaleVolumeEntry[];
}

export interface InstanceResourceInventory {
  instanceKey: string;
  instanceId: string;
  label?: string;
  services: ServiceListEntry[];
  ports: PortListEntry[];
}

export interface ResourceInventoryEntry {
  type: "nativeProcess" | "container" | "volume";
  name: string;
  reason: string;
}

export interface StaleVolumeEntry {
  name: string;
  service: string;
  internalDir: string;
}

function normalizePorts(
  ports: string[] | undefined,
  statePorts: Record<string, string> | undefined,
): string[] {
  if (!ports || ports.length === 0) return [];
  return ports.map((port) => {
    let resolved = port;

    if (statePorts) {
      for (const [name, value] of Object.entries(statePorts)) {
        const token = `$${name}`;

        if (resolved.includes(token)) {
          resolved = resolved.split(token).join(value);
        }
      }
    }

    return resolved;
  });
}

function extractProcessPorts(
  context: Context,
  env: Record<string, string>,
  statePorts: Record<string, string> | undefined,
): string[] {
  if (!context.ports || context.ports.length === 0) return [];
  return context.ports
    .filter(
      (name) => statePorts?.[name] !== undefined || env[name] !== undefined,
    )
    .map((name) => `${name}=${statePorts?.[name] ?? env[name]}`);
}

function buildPortEntries(
  context: Context,
  statePorts: Record<string, string> | undefined,
): PortListEntry[] {
  if (!context.ports || context.ports.length === 0) return [];
  return context.ports.map((name) => ({
    name,
    value: statePorts?.[name] ?? "",
  }));
}

function parseManagedVolumeName(
  name: string,
): { project: string; instanceId: string } | null {
  const parts = name.split(".");
  if (parts.length !== 4) return null;
  if (parts[0] !== "zap" || !/^vol\d+$/.test(parts[3])) return null;
  return { project: parts[1], instanceId: parts[2] };
}

function getStaleVolumeEntries(
  volumes: Record<string, StoredVolume>,
  currentSpecs: Set<string>,
): StaleVolumeEntry[] {
  return Object.entries(volumes)
    .filter(([, volume]) => {
      return !currentSpecs.has(`${volume.service}:${volume.internal_dir}`);
    })
    .map(([name, volume]) => ({
      name,
      service: volume.service,
      internalDir: volume.internal_dir,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getResourceInventory(
  context: Context,
  service?: string | string[],
): Promise<ResourceInventory> {
  const stateInstances = context.state.instances || {};

  const configuredServices = new Set([
    ...context.processes.map((process) => process.name),
    ...context.containers.map((container) => container.name),
  ]);

  const currentSpecs = collectManagedVolumeSpecs(context.containers);

  const currentSpecKeys = new Set(
    currentSpecs.map((spec) => `${spec.serviceName}:${spec.internalDir}`),
  );

  const [nativeProcesses, dockerContainers, dockerVolumes] = await Promise.all([
    NativeProcessManager.listProcesses(),
    DockerManager.listContainers(),
    DockerManager.listVolumes(),
  ]);

  const instances = new Map<string, InstanceResourceInventory>();

  for (const [instanceKey, instance] of Object.entries(stateInstances)) {
    const instanceContext: Context = {
      ...context,
      instanceKey,
      instanceId: instance.id,
      instance: {
        key: instanceKey,
        id: instance.id,
        label: instance.label,
        ports: instance.ports || {},
        volumes: instance.volumes || {},
      },
    };

    instances.set(instance.id, {
      instanceKey,
      instanceId: instance.id,
      label: instance.label,
      services: buildServiceEntries(
        context,
        await getStatus(instanceContext, service, false),
        instance.ports || {},
        instance.volumes || {},
      ),
      ports: buildPortEntries(context, instance.ports || {}),
    });
  }

  const alien: ResourceInventoryEntry[] = [];
  const dangling: ResourceInventoryEntry[] = [];

  const classifyServiceResource = (
    type: "nativeProcess" | "container",
    name: string,
  ) => {
    const parsed = parseServiceName(name);
    if (!parsed || parsed.project !== context.projectName) return;

    const instanceId = parsed.instanceId;

    if (!instanceId) {
      alien.push({ type, name, reason: "legacy unscoped resource" });
      return;
    }

    const instance = instances.get(instanceId);

    if (!instance) {
      alien.push({ type, name, reason: "instance not in this repo state" });
      return;
    }

    if (!configuredServices.has(parsed.service)) {
      dangling.push({
        type,
        name,
        reason: `service "${parsed.service}" is not in current zap.yaml`,
      });
    }
  };

  for (const process of nativeProcesses) {
    classifyServiceResource("nativeProcess", process.name);
  }

  for (const container of dockerContainers) {
    classifyServiceResource("container", container.name);
  }

  for (const volume of dockerVolumes) {
    const parsed = parseManagedVolumeName(volume.name);
    if (!parsed || parsed.project !== context.projectName) continue;

    const instance = instances.get(parsed.instanceId);

    if (!instance) {
      alien.push({
        type: "volume",
        name: volume.name,
        reason: "instance not in this repo state",
      });

      continue;
    }

    if (!stateInstances[instance.instanceKey]?.volumes?.[volume.name]) {
      dangling.push({
        type: "volume",
        name: volume.name,
        reason: "Docker volume is not tracked in current repo state",
      });
    }
  }

  const staleVolumes = getStaleVolumeEntries(
    stateInstances[context.instanceKey]?.volumes || {},
    currentSpecKeys,
  );

  for (const volume of staleVolumes) {
    dangling.push({
      type: "volume",
      name: volume.name,
      reason: `${volume.service}:${volume.internalDir} is not in current zap.yaml`,
    });
  }

  return {
    instances: Array.from(instances.values()).sort((a, b) =>
      a.instanceKey.localeCompare(b.instanceKey),
    ),
    alien: alien.sort((a, b) => a.name.localeCompare(b.name)),
    dangling: dangling.sort((a, b) => a.name.localeCompare(b.name)),
    staleVolumes,
  };
}

function buildServiceEntries(
  context: Context,
  statusResult: Awaited<ReturnType<typeof getStatus>>,
  statePorts: Record<string, string> | undefined,
  stateVolumes: Record<string, StoredVolume> | undefined,
): ServiceListEntry[] {
  const nativeStatus = new Map(
    statusResult.native.map((item) => [item.service, item]),
  );

  const dockerStatus = new Map(
    statusResult.docker.map((item) => [item.service, item]),
  );

  const nativeEntries: ServiceListEntry[] = context.processes.map((proc) => {
    const status = nativeStatus.get(proc.name);
    return {
      type: "native",
      service: proc.name,
      status: status?.status ?? "down",
      enabled: status?.enabled ?? true,
      ports: extractProcessPorts(context, proc.resolvedEnv || {}, statePorts),
      volumes: [],
      cwd: proc.cwd,
      cmd: proc.cmd,
    };
  });

  const dockerEntries: ServiceListEntry[] = context.containers.map(
    (container) => {
      const status = dockerStatus.get(container.name);
      return {
        type: "docker",
        service: container.name,
        status: status?.status ?? "down",
        enabled: status?.enabled ?? true,
        ports: normalizePorts(container.ports, statePorts),
        volumes: getContainerVolumeBindings(
          container.name,
          container.volumes,
          stateVolumes || {},
        ),
        cmd: container.command
          ? formatDockerCommand(container.command)
          : container.image || "docker build",
      };
    },
  );

  return [...nativeEntries, ...dockerEntries];
}

export async function getServiceList(
  context: Context,
  service?: string | string[],
  options: { extended?: boolean } = {},
): Promise<ServiceListResult> {
  const resolvedService = resolveServiceTargets(context, service);
  const statusResult = await getStatus(context, resolvedService, false);
  const instancePorts = context.instance?.ports;

  const loadedPorts =
    instancePorts && Object.keys(instancePorts).length > 0
      ? instancePorts
      : loadPortsForInstance(context.projectRoot, context.instanceKey);

  const instanceVolumes = context.instance?.volumes;

  const loadedVolumes =
    instanceVolumes && Object.keys(instanceVolumes).length > 0
      ? instanceVolumes
      : loadVolumesForInstance(context.projectRoot, context.instanceKey);

  const entries = buildServiceEntries(
    context,
    statusResult,
    loadedPorts,
    loadedVolumes,
  );

  const serviceSet =
    resolvedService === undefined
      ? undefined
      : new Set(
          Array.isArray(resolvedService) ? resolvedService : [resolvedService],
        );

  const services = entries.filter((item) =>
    serviceSet ? serviceSet.has(item.service) : true,
  );

  return {
    services,
    ports: buildPortEntries(context, loadedPorts),
    resources: options.extended
      ? await getResourceInventory(context, resolvedService)
      : undefined,
  };
}
