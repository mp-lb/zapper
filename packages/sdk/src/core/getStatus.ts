import { NativeProcessManager } from "./process";
import { DockerManager } from "./docker";
import { Context } from "../types/Context";
import { Healthcheck } from "../types";
import { buildServiceName } from "../utils/nameBuilder";
import { resolveServiceTargets } from "../utils/serviceAliases";

type Status = "down" | "pending" | "up";

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
  healthcheck?: Healthcheck,
): Promise<Status> {
  if (!running) return "down";
  if (healthcheck === undefined) return "up";

  if (
    typeof healthcheck === "string" ||
    (typeof healthcheck === "object" && healthcheck.type === "http")
  ) {
    const url = typeof healthcheck === "string" ? healthcheck : healthcheck.url;
    const healthy = await checkHealthUrl(url);
    return healthy ? "up" : "pending";
  }

  if (!startedAtMs) return "up";

  const seconds =
    typeof healthcheck === "number" ? healthcheck : healthcheck.seconds;

  const elapsed = (Date.now() - startedAtMs) / 1000;
  return elapsed < seconds ? "pending" : "up";
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
  const resolvedService = context
    ? resolveServiceTargets(context, service)
    : service;

  const normalizedService =
    Array.isArray(resolvedService) && resolvedService.length === 0
      ? undefined
      : resolvedService;

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

  const nativeProcessList = await NativeProcessManager.listProcesses();

  if (!context) {
    const filtered = nativeProcessList.filter(() => {
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
  const native: ServiceStatus[] = [];

  for (const proc of context.processes) {
    if (!matchesService(proc.name)) continue;

    const expectedNativeProcessName = buildServiceName(
      projectName,
      proc.name,
      context.instanceId,
    );

    const runningProcess = nativeProcessList.find(
      (p) => p.name === expectedNativeProcessName,
    );

    const healthcheck = proc.healthcheck;

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
      rawName: expectedNativeProcessName,
      status,
      type: "native" as const,
      enabled: true,
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

    const healthcheck = container.healthcheck;

    let status: Status = "down";

    if (containerInfo) {
      const running = isRunning(containerInfo.status, "docker");

      const startedAtMs = containerInfo.startedAt
        ? new Date(containerInfo.startedAt).getTime()
        : undefined;

      status = await computeStatus(running, startedAtMs, healthcheck);
    }

    docker.push({
      service: container.name as string,
      rawName: expectedDockerName,
      status,
      type: "docker" as const,
      enabled: true,
    });
  }

  return { native, docker };
}
