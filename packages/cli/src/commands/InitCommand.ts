import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { initializePorts, getPortsPath } from "../config/portsManager";
import {
  collectManagedVolumeSpecs,
  initializeManagedVolumes,
  loadVolumesForInstance,
} from "../config/volumeManager";
import { createInstance, DEFAULT_INSTANCE_KEY } from "../core/instanceResolver";

export class InitCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options } = context;
    const ctx = zapper.getContext();

    if (!ctx) {
      throw new Error("Context not loaded");
    }

    const selectedInstanceKey =
      typeof options.instance === "string" && options.instance.trim().length > 0
        ? options.instance.trim()
        : ctx.instanceKey || DEFAULT_INSTANCE_KEY;

    const randomize = Boolean(options.random);

    const instanceId = createInstance(ctx.projectRoot, selectedInstanceKey);
    ctx.instanceKey = selectedInstanceKey;
    ctx.instanceId = instanceId;

    const scopedPorts = initializePorts(
      ctx.projectRoot,
      ctx.ports || [],
      selectedInstanceKey,
      {
        randomizeAll: randomize,
      },
    );

    initializeManagedVolumes(
      ctx.projectRoot,
      ctx.projectName,
      selectedInstanceKey,
      instanceId,
      collectManagedVolumeSpecs(ctx.containers),
    );

    ctx.instance = {
      key: selectedInstanceKey,
      id: instanceId,
      ports: scopedPorts,
      volumes: loadVolumesForInstance(ctx.projectRoot, selectedInstanceKey),
    };

    if (ctx.initTask) {
      await zapper.runTask(ctx.initTask);
    }

    return {
      kind: "init",
      isolated: true,
      instanceKey: selectedInstanceKey,
      instanceId,
      ports: scopedPorts,
      path: getPortsPath(ctx.projectRoot),
      randomized: randomize,
      warningShown: false,
    };
  }
}
