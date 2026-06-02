import { StoredVolume } from "../config/schemas";
import {
  collectManagedVolumeSpecs,
  findStaleManagedVolumes,
  getServiceDockerVolumes,
  initializeManagedVolumes,
  loadVolumesForInstance,
  pruneStaleManagedVolumesForInstance,
  resetManagedVolumesForInstance,
  ServiceDockerVolume,
} from "../config/volumeManager";
import { DockerManager } from "../core/docker";
import { ServiceNotFoundError } from "../errors";
import { confirm } from "../utils/confirm";
import { resolveServiceTargets } from "../utils/serviceAliases";
import { renderer } from "../ui/renderer";
import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class VolumeCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options, service } = context;
    const ctx = zapper.getContext();
    if (!ctx) throw new Error("Context not loaded");

    const args = Array.isArray(service) ? service : service ? [service] : [];
    const subcommand = args[0] || "prune";

    if (
      subcommand !== "prune" &&
      subcommand !== "reset" &&
      subcommand !== "list"
    ) {
      throw new Error(`Unknown volume command: ${subcommand}`);
    }

    if (subcommand === "list") {
      const serviceName = args[1];

      if (!serviceName) {
        throw new Error("Volume list requires one Docker service name");
      }

      if (args.length > 2) {
        throw new Error("Volume list accepts one Docker service name");
      }

      const resolved = resolveServiceTargets(ctx, serviceName);
      const resolvedService = Array.isArray(resolved) ? resolved[0] : resolved;
      if (!resolvedService) throw new ServiceNotFoundError(serviceName);

      const container = ctx.containers.find(
        (item) => item.name === resolvedService,
      );

      if (!container) {
        throw new ServiceNotFoundError(
          serviceName,
          `Docker service not found: ${serviceName}. Check Docker service names or aliases`,
        );
      }

      if (!ctx.instanceId) {
        throw new Error("Instance not loaded");
      }

      initializeManagedVolumes(
        ctx.projectRoot,
        ctx.projectName,
        ctx.instanceKey,
        ctx.instanceId,
        collectManagedVolumeSpecs([container]),
        { prune: false },
      );

      const allVolumes = getServiceDockerVolumes(
        container.name,
        container.volumes,
        loadVolumesForInstance(ctx.projectRoot, ctx.instanceKey),
      );

      const volumes = options.managed
        ? allVolumes.filter((volume) => volume.managed)
        : allVolumes;

      return {
        kind: "volume.list",
        instanceKey: ctx.instanceKey,
        service: container.name,
        managedOnly: Boolean(options.managed),
        idOnly: Boolean(options.idOnly),
        volumes,
      };
    }

    if (args.length > 1) {
      throw new Error(`Volume ${subcommand} does not accept a service name`);
    }

    if (subcommand === "reset") {
      const reset = resetManagedVolumesForInstance(
        ctx.projectRoot,
        ctx.instanceKey,
      );

      return {
        kind: "volume.reset",
        instanceKey: ctx.instanceKey,
        volumes: reset,
      };
    }

    const currentSpecs = collectManagedVolumeSpecs(ctx.containers);

    const stale = findStaleManagedVolumes(
      ctx.projectRoot,
      ctx.instanceKey,
      currentSpecs,
    );

    const volumeNames = Object.keys(stale);

    if (volumeNames.length === 0) {
      return {
        kind: "volume.prune",
        status: "completed",
        instanceKey: ctx.instanceKey,
        volumes: stale,
      };
    }

    renderer.log.info(
      `This will remove ${volumeNames.length} stale managed Docker volume(s) for instance "${ctx.instanceKey}".`,
    );

    const proceed = await confirm(
      renderer.confirm.deleteResourcesPromptText(),
      {
        defaultYes: false,
        force: options.force,
      },
    );

    if (!proceed) {
      return {
        kind: "volume.prune",
        status: "aborted",
        instanceKey: ctx.instanceKey,
        volumes: stale,
      };
    }

    for (const volumeName of volumeNames) {
      await DockerManager.removeVolume(volumeName);
    }

    pruneStaleManagedVolumesForInstance(
      ctx.projectRoot,
      ctx.instanceKey,
      currentSpecs,
    );

    return {
      kind: "volume.prune",
      status: "completed",
      instanceKey: ctx.instanceKey,
      volumes: stale,
    };
  }
}

export type VolumeCommandVolumes = Record<string, StoredVolume>;
export type VolumeCommandServiceVolumes = ServiceDockerVolume[];
