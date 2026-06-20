import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { ZapperConfig, Container } from "../utils";
import { DockerManager } from "./docker";
import { NativeProcessExecutor } from "./process/NativeProcessExecutor";
import {
  Action,
  ActionPlan,
  ExecutionWave,
  Healthcheck,
  ServiceActionEvent,
  ServiceActionReporter,
  ServiceExecutionReport,
} from "../types";
import {
  applyServiceActionEventToExecutionReport,
  emptyServiceExecutionReport,
} from "../utils/serviceActionReport";
import { findProcess } from "./findProcess";
import { findContainer } from "./findContainer";
import { buildServiceName } from "../utils/nameBuilder";
import { DEFAULT_INSTANCE_KEY } from "./instanceResolver";
import { resolveContainerVolumes } from "../config/volumeManager";
import {
  getProjectRootHash,
  getSystemRegistryId,
} from "../system/SystemRegistry";
import { resolveHostPath } from "../runtime";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugifyImagePart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "service"
  );
}

export function getDockerImageName(
  projectName: string,
  serviceName: string,
  container: Container,
): string {
  return (
    container.image ||
    `zap.${slugifyImagePart(projectName)}.${slugifyImagePart(serviceName)}:dev`
  );
}

function resolveBuildConfig(
  projectRoot: string,
  image: string,
  build: Container["build"],
) {
  if (!build) return undefined;

  if (typeof build === "string") {
    return {
      context: resolveHostPath(projectRoot, build),
      tag: image,
    };
  }

  const context = resolveHostPath(projectRoot, build.context);
  return {
    context,
    dockerfile: build.dockerfile
      ? resolveHostPath(context, build.dockerfile)
      : undefined,
    target: build.target,
    args: build.args,
    tag: image,
  };
}

function resolveSecretVolumes({
  projectRoot,
  secrets,
  serviceSecrets,
}: {
  projectRoot: string;
  secrets?: ZapperConfig["secrets"];
  serviceSecrets?: Container["secrets"];
}): string[] {
  const volumes: string[] = [];

  for (const serviceSecret of serviceSecrets || []) {
    const source =
      typeof serviceSecret === "string" ? serviceSecret : serviceSecret.source;

    const target =
      typeof serviceSecret === "string"
        ? `/run/secrets/${source}`
        : serviceSecret.target || `/run/secrets/${source}`;

    const secret = secrets?.[source];
    if (!secret) throw new Error(`Secret not found: ${source}`);

    if (typeof secret === "string") {
      volumes.push(`${resolveHostPath(projectRoot, secret)}:${target}:ro`);
      continue;
    }

    if (secret.file) {
      volumes.push(`${resolveHostPath(projectRoot, secret.file)}:${target}:ro`);
      continue;
    }

    if (secret.env) {
      const value = process.env[secret.env];

      if (value === undefined) {
        throw new Error(
          `Secret ${source} references missing environment variable ${secret.env}`,
        );
      }

      const secretDir = path.join(projectRoot, ".zap", "secrets");
      mkdirSync(secretDir, { recursive: true, mode: 0o700 });
      const secretPath = path.join(secretDir, source);
      writeFileSync(secretPath, value, { mode: 0o600 });
      volumes.push(`${resolveHostPath(projectRoot, secretPath)}:${target}:ro`);
    }
  }

  return volumes;
}

interface NormalizedHealthcheck {
  type: "delay" | "http";
  seconds?: number;
  url?: string;
  timeout: number;
  interval: number;
}

function normalizeHealthcheck(healthcheck: Healthcheck): NormalizedHealthcheck {
  if (typeof healthcheck === "number") {
    return { type: "delay", seconds: healthcheck, timeout: 0, interval: 0 };
  }

  if (typeof healthcheck === "string") {
    return { type: "http", url: healthcheck, timeout: 120, interval: 1 };
  }

  if (healthcheck.type === "delay") {
    return {
      type: "delay",
      seconds: healthcheck.seconds,
      timeout: 0,
      interval: 0,
    };
  }

  return {
    type: "http",
    url: healthcheck.url,
    timeout: healthcheck.timeout ?? 120,
    interval: healthcheck.interval ?? 1,
  };
}

function describeHealthcheck(healthcheck: Healthcheck): string {
  if (typeof healthcheck === "number") return `${healthcheck}s delay`;
  if (typeof healthcheck === "string") return healthcheck;
  if (healthcheck.type === "delay") return `${healthcheck.seconds}s delay`;
  return healthcheck.url;
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

async function waitForHealth(
  action: Action,
  reporter?: ServiceActionReporter,
): Promise<void> {
  if (action.type !== "start") return;

  const { healthcheck } = action;
  if (healthcheck === undefined) return;
  const normalized = normalizeHealthcheck(healthcheck);

  if (normalized.type === "delay") {
    await sleep((normalized.seconds ?? 0) * 1000);
    return;
  }

  const { url } = normalized;
  if (!url) return;

  const startedAt = Date.now();
  const timeoutMs = normalized.timeout * 1000;
  const intervalMs = normalized.interval * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHealthUrl(url)) return;
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  reporter?.onEvent({
    type: "service.healthcheck.timeout",
    service: action.name,
    healthcheck: describeHealthcheck(healthcheck),
  });
}

/**
 * Converts a wave into a structured progress event.
 * Groups actions by type and sorts alphabetically.
 */
function waveToEvent(wave: ExecutionWave) {
  const start = wave.actions
    .filter((a) => a.type === "start")
    .map((a) => a.name)
    .sort();

  const stop = wave.actions
    .filter((a) => a.type === "stop")
    .map((a) => a.name)
    .sort();

  return { type: "services.wave" as const, start, stop };
}

function waveCompletedEvent(wave: ExecutionWave): ServiceActionEvent {
  const started = wave.actions
    .filter((a) => a.type === "start")
    .map((a) => a.name)
    .sort();

  const stopped = wave.actions
    .filter((a) => a.type === "stop")
    .map((a) => a.name)
    .sort();

  return { type: "services.wave.completed", started, stopped };
}

async function executeAction(
  action: Action,
  config: ZapperConfig,
  projectName: string,
  nativeProcesses: NativeProcessExecutor,
  configDir?: string | null,
): Promise<void> {
  if (action.serviceType === "native") {
    const proc = findProcess(config, action.name);
    if (!proc) throw new Error(`Process not found: ${action.name}`);

    if (action.type === "start") {
      await nativeProcesses.startProcess(proc, projectName);
    } else {
      await nativeProcesses.stopProcess(proc.name as string);
    }
  } else {
    const pair = findContainer(config, action.name);
    if (!pair) throw new Error(`Docker service not found: ${action.name}`);
    const [name, c] = pair;

    const runtimeConfig = config as ZapperConfig & {
      instanceId?: string;
      instanceKey?: string;
      configPath?: string;
    };

    const instanceId = runtimeConfig.instanceId;
    const instanceKey = runtimeConfig.instanceKey || DEFAULT_INSTANCE_KEY;
    const dockerName = buildServiceName(projectName, name, instanceId);

    if (action.type === "start") {
      const ports = Array.isArray(c.ports) ? c.ports : [];
      const image = getDockerImageName(projectName, name, c);
      const buildConfig = resolveBuildConfig(configDir || ".", image, c.build);

      if (buildConfig) {
        await DockerManager.buildImage(buildConfig);
      }

      const resolvedVolumes = resolveContainerVolumes({
        projectRoot: configDir || ".",
        projectName,
        instanceKey,
        instanceId: instanceId || DEFAULT_INSTANCE_KEY,
        serviceName: name,
        volumes: c.volumes,
        topLevelVolumes: runtimeConfig.volumes,
      });

      for (const vol of resolvedVolumes.namedVolumesToCreate) {
        await DockerManager.createVolume(vol);
      }

      const envMap = c.resolvedEnv || {};

      const secretVolumes = resolveSecretVolumes({
        projectRoot: configDir || ".",
        secrets: runtimeConfig.secrets,
        serviceSecrets: c.secrets,
      });

      const labels = {
        "com.docker.compose.project": projectName,
        "com.docker.compose.service": name,
        "com.zapper.project": projectName,
        "com.zapper.service": name,
        "com.zapper.instance-id": instanceId || "",
        "com.zapper.instance-key": instanceKey,
      } as Record<string, string>;

      if (runtimeConfig.configPath) {
        labels["com.zapper.registry-id"] = getSystemRegistryId(
          configDir || ".",
          runtimeConfig.configPath,
        );

        labels["com.zapper.project-root-hash"] = getProjectRootHash(
          configDir || ".",
        );
      }

      await DockerManager.startContainerAsync(
        dockerName,
        {
          image,
          ...(c.hostname ? { hostname: c.hostname } : {}),
          ports,
          volumes: [...resolvedVolumes.bindings, ...secretVolumes],
          networks: c.networks,
          environment: envMap,
          command: c.command,
          labels,
        },
        {
          projectName,
          serviceName: name,
          configDir: configDir || undefined,
        },
      );
    } else {
      await DockerManager.stopContainer(dockerName);
    }
  }
}

export async function executeActions(
  config: ZapperConfig,
  projectName: string,
  configDir: string | null,
  plan: ActionPlan,
  reporter?: ServiceActionReporter,
): Promise<ServiceExecutionReport> {
  const instanceId = (config as ZapperConfig & { instanceId?: string })
    .instanceId;

  const nativeProcesses = new NativeProcessExecutor(
    projectName,
    configDir || undefined,
    instanceId,
  );

  const report = emptyServiceExecutionReport();

  const emit = (event: ServiceActionEvent) => {
    applyServiceActionEventToExecutionReport(report, event);
    reporter?.onEvent(event);
  };

  for (const wave of plan.waves) {
    emit(waveToEvent(wave));

    // Execute all actions in the wave in parallel
    await Promise.all(
      wave.actions.map((action) =>
        executeAction(action, config, projectName, nativeProcesses, configDir),
      ),
    );

    emit(waveCompletedEvent(wave));

    // Wait for health checks in parallel
    await Promise.all(
      wave.actions.map((action) => waitForHealth(action, reporter)),
    );
  }

  return report;
}
