import { Context } from "../types/Context";
import { getStatus } from "./getStatus";
import { loadPortsForInstance } from "../config/portsManager";

export interface ServiceListEntry {
  type: "native" | "docker";
  service: string;
  status: "down" | "pending" | "up";
  ports: string[];
  cwd?: string;
  cmd: string;
}

export interface ServiceListResult {
  services: ServiceListEntry[];
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

function extractProcessPorts(context: Context, env: Record<string, string>): string[] {
  if (!context.ports || context.ports.length === 0) return [];
  return context.ports
    .filter((name) => env[name] !== undefined)
    .map((name) => `${name}=${env[name]}`);
}

export async function getServiceList(
  context: Context,
  service?: string | string[],
): Promise<ServiceListResult> {
  const statusResult = await getStatus(context, service, false);

  const nativeStatus = new Map(
    statusResult.native.map((item) => [item.service, item.status]),
  );
  const dockerStatus = new Map(
    statusResult.docker.map((item) => [item.service, item.status]),
  );

  const nativeEntries: ServiceListEntry[] = context.processes.map((proc) => ({
    type: "native",
    service: proc.name,
    status: nativeStatus.get(proc.name) ?? "down",
    ports: extractProcessPorts(context, proc.resolvedEnv || {}),
    cwd: proc.cwd,
    cmd: proc.cmd,
  }));

  const loadedPorts =
    context.instance?.ports ||
    loadPortsForInstance(context.projectRoot, context.instanceKey);
  const statePorts =
    Object.keys(loadedPorts).length > 0 ? loadedPorts : context.state.ports;
  const dockerEntries: ServiceListEntry[] = context.containers.map((container) => ({
    type: "docker",
    service: container.name,
    status: dockerStatus.get(container.name) ?? "down",
    ports: normalizePorts(container.ports, statePorts),
    cmd: container.command || container.image,
  }));

  const serviceSet =
    service === undefined
      ? undefined
      : new Set(Array.isArray(service) ? service : [service]);

  const services = [...nativeEntries, ...dockerEntries].filter((item) =>
    serviceSet ? serviceSet.has(item.service) : true,
  );

  return { services };
}
