import { ZapperConfig } from "../utils";
import { DockerManager } from "./docker";
import { renderer } from "../ui/renderer";
import { Pm2Executor } from "./process/Pm2Executor";
import { Action, ActionPlan, ExecutionWave } from "../types";
import { findProcess } from "./findProcess";
import { findContainer } from "./findContainer";
import { buildServiceName } from "../utils/nameBuilder";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function waitForHealth(action: Action): Promise<void> {
  if (action.type !== "start") return;

  const { healthcheck } = action;
  if (typeof healthcheck === "number") {
    await sleep(healthcheck * 1000);
  } else if (typeof healthcheck === "string") {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      if (await checkHealthUrl(healthcheck)) return;
      await sleep(1000);
    }
    renderer.log.warn(`Healthcheck timeout for ${action.name}: ${healthcheck}`);
  }
}

/**
 * Formats wave output as a user-friendly message.
 * Groups actions by type and sorts alphabetically.
 * Output format: "Stopped service1, service2" or "Starting service1, service2"
 */
function formatWaveOutput(wave: ExecutionWave): string[] {
  const lines: string[] = [];

  // Group actions by type
  const startActions = wave.actions
    .filter((a) => a.type === "start")
    .map((a) => a.name)
    .sort();

  const stopActions = wave.actions
    .filter((a) => a.type === "stop")
    .map((a) => a.name)
    .sort();

  if (stopActions.length > 0) {
    lines.push(`Stopped ${stopActions.join(", ")}`);
  }

  if (startActions.length > 0) {
    lines.push(`Starting ${startActions.join(", ")}`);
  }

  return lines;
}

async function executeAction(
  action: Action,
  config: ZapperConfig,
  projectName: string,
  pm2: Pm2Executor,
  configDir?: string | null,
): Promise<void> {
  if (action.serviceType === "native") {
    const proc = findProcess(config, action.name);
    if (!proc) throw new Error(`Process not found: ${action.name}`);

    if (action.type === "start") {
      await pm2.startProcess(proc, projectName);
    } else {
      await pm2.stopProcess(proc.name as string);
    }
  } else {
    const pair = findContainer(config, action.name);
    if (!pair) throw new Error(`Docker service not found: ${action.name}`);
    const [name, c] = pair;
    const instanceId = (config as ZapperConfig & { instanceId?: string })
      .instanceId;
    const dockerName = buildServiceName(projectName, name, instanceId);

    if (action.type === "start") {
      const ports = Array.isArray(c.ports) ? c.ports : [];
      const volumeBindings: string[] = [];
      const ensureVolumeNames: string[] = [];

      if (Array.isArray(c.volumes)) {
        for (const v of c.volumes) {
          if (typeof v === "string") {
            const [volName, internal] = v.split(":");
            ensureVolumeNames.push(volName);
            volumeBindings.push(`${volName}:${internal}`);
          } else {
            ensureVolumeNames.push(v.name);
            volumeBindings.push(`${v.name}:${v.internal_dir}`);
          }
        }
      }

      for (const vol of ensureVolumeNames) {
        await DockerManager.createVolume(vol);
      }

      const envMap = c.resolvedEnv || {};

      const labels = {
        "com.docker.compose.project": projectName,
        "com.docker.compose.service": name,
        "com.zapper.project": projectName,
        "com.zapper.service": name,
      } as Record<string, string>;

      await DockerManager.startContainerAsync(
        dockerName,
        {
          image: c.image,
          ports,
          volumes: volumeBindings,
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
): Promise<void> {
  const instanceId = (config as ZapperConfig & { instanceId?: string })
    .instanceId;
  const pm2 = new Pm2Executor(projectName, configDir || undefined, instanceId);

  for (const wave of plan.waves) {
    // Output wave-level message before executing
    const messages = formatWaveOutput(wave);
    for (const msg of messages) {
      renderer.log.info(msg);
    }

    // Execute all actions in the wave in parallel
    await Promise.all(
      wave.actions.map((action) =>
        executeAction(action, config, projectName, pm2, configDir),
      ),
    );

    // Wait for health checks in parallel
    await Promise.all(wave.actions.map((action) => waitForHealth(action)));
  }
}
