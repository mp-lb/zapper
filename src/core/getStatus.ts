import { Pm2Manager } from "./process";
import { DockerManager } from "./docker";
import { Context } from "../types/Context";
import { clearServiceState } from "../config/stateLoader";
import { buildServiceName } from "../utils/nameBuilder";

type Status = "down" | "pending" | "up";

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRunning(rawStatus: string, type: "native" | "docker"): boolean {
  const s = rawStatus.toLowerCase();
  if (type === "native") return s === "online";
  return s === "running";
}

async function checkHealthUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function computeStatus(
  running: boolean,
  startedAtMs: number | undefined,
  healthcheck: number | string,
): Promise<Status> {
  if (!running) return "down";
  if (typeof healthcheck === "string") {
    const healthy = await checkHealthUrl(healthcheck);
    return healthy ? "up" : "pending";
  }
  if (!startedAtMs) return "up";
  const elapsed = (Date.now() - startedAtMs) / 1000;
  return elapsed < healthcheck ? "pending" : "up";
}

function isServiceEnabled(
  serviceProfiles: string[] | undefined,
  activeProfile: string | undefined,
): boolean {
  if (!serviceProfiles || serviceProfiles.length === 0) return true;
  return !!activeProfile && serviceProfiles.includes(activeProfile);
}

export interface ServiceStatus {
  service: string;
  rawName: string;
  status: Status;
  type: "native" | "docker";
  enabled: boolean;
}

export interface StatusResult {
  native: ServiceStatus[];
  docker: ServiceStatus[];
}

export async function getStatus(
  context?: Context,
  service?: string | string[],
  all: boolean = false,
): Promise<StatusResult> {
  const normalizedService =
    Array.isArray(service) && service.length === 0 ? undefined : service;
  const serviceSet =
    normalizedService === undefined
      ? undefined
      : new Set(
          Array.isArray(normalizedService)
            ? normalizedService
            : [normalizedService],
        );
  const matchesService = (name: string): boolean =>
    !serviceSet || serviceSet.has(name);

  const pm2List = await Pm2Manager.listProcesses();

  if (!context) {
    const filtered = pm2List.filter(() => {
      if (all) return true;
      return true;
    });

    const native = filtered
      .map((p) => ({
        rawName: p.name,
        service: p.name.split(".").pop() || p.name,
        status: (isRunning(p.status, "native") ? "up" : "down") as Status,
        type: "native" as const,
        enabled: true,
      }))
      .filter((p) => matchesService(p.service));

    const allDocker = await DockerManager.listContainers();
    const docker = allDocker
      .map((c) => ({
        rawName: c.name,
        service: c.name.split(".").pop() || c.name,
        status: (isRunning(c.status, "docker") ? "up" : "down") as Status,
        type: "docker" as const,
        enabled: true,
      }))
      .filter((c) => !!c.rawName)
      .filter((c) => matchesService(c.service));

    return { native, docker };
  }

  const projectName = context.projectName;
  const serviceStates = context.state.services || {};
  const activeProfile = context.state.activeProfile;

  const native: ServiceStatus[] = [];
  for (const proc of context.processes) {
    if (!matchesService(proc.name)) continue;

    const expectedPm2Name = buildServiceName(
      projectName,
      proc.name,
      context.instanceId,
    );
    const runningProcess = pm2List.find((p) => p.name === expectedPm2Name);
    const healthcheck = proc.healthcheck ?? 5;
    const enabled = isServiceEnabled(proc.profiles, activeProfile);

    let status: Status = "down";
    if (runningProcess) {
      const running = isRunning(runningProcess.status, "native");
      const startedAtMs = running
        ? Date.now() - runningProcess.uptime
        : undefined;
      status = await computeStatus(running, startedAtMs, healthcheck);
    }

    native.push({
      service: proc.name as string,
      rawName: expectedPm2Name,
      status,
      type: "native" as const,
      enabled,
    });
  }

  const docker: ServiceStatus[] = [];
  for (const container of context.containers) {
    if (!matchesService(container.name)) continue;

    const expectedDockerName = buildServiceName(
      projectName,
      container.name,
      context.instanceId,
    );
    const containerInfo =
      await DockerManager.getContainerInfo(expectedDockerName);
    const healthcheck = container.healthcheck ?? 5;
    const serviceState = serviceStates[expectedDockerName];
    const enabled = isServiceEnabled(container.profiles, activeProfile);

    let status: Status = "down";

    if (serviceState?.startPid && isPidAlive(serviceState.startPid)) {
      status = "pending";
    } else {
      if (serviceState?.startPid) {
        clearServiceState(context.projectRoot, expectedDockerName);
      }
      if (containerInfo) {
        const running = isRunning(containerInfo.status, "docker");
        const startedAtMs = containerInfo.startedAt
          ? new Date(containerInfo.startedAt).getTime()
          : undefined;
        status = await computeStatus(running, startedAtMs, healthcheck);
      }
    }

    docker.push({
      service: container.name as string,
      rawName: expectedDockerName,
      status,
      type: "docker" as const,
      enabled,
    });
  }

  return { native, docker };
}
