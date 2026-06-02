import { loadState } from "../config/stateLoader";
import {
  getInstanceDisplayLabel,
  setInstanceLabel,
  validateInstanceLabel,
} from "../core/instanceResolver";
import { touchSystemProject } from "../system/SystemRegistry";
import { CommandContext, CommandHandler } from "./CommandHandler";
import { CommandResult } from "./CommandResult";

export class InstanceCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, service, options } = context;
    const args = Array.isArray(service) ? service : service ? [service] : [];
    const [action, ...rest] = args;

    if (action !== "label") {
      throw new Error(
        "Unknown instance command. Use: zap instance label [label]",
      );
    }

    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Project context did not load");
    }

    if (rest.length === 0) {
      const instance = zapperContext.instance || {
        id: zapperContext.instanceId || "",
        label:
          zapperContext.state.instances?.[zapperContext.instanceKey]?.label,
      };

      return {
        kind: "instance.label",
        instanceKey: zapperContext.instanceKey,
        instanceId: instance.id,
        label: instance.label,
        displayLabel: getInstanceDisplayLabel(instance),
        updated: false,
      };
    }

    const label = rest.join(" ");
    validateInstanceLabel(label);

    const result = setInstanceLabel(
      zapperContext.projectRoot,
      zapperContext.instanceKey,
      label,
    );

    zapperContext.state = loadState(zapperContext.projectRoot);
    zapperContext.instance = {
      ...(zapperContext.instance || {
        key: result.instanceKey,
        id: result.instanceId,
        ports: {},
      }),
      label: result.label,
    };

    if (zapperContext.configPath) {
      touchSystemProject({
        context: zapperContext,
        configPath: zapperContext.configPath,
        command:
          typeof options.__command === "string" ? options.__command : undefined,
      });
    }

    return {
      kind: "instance.label",
      instanceKey: result.instanceKey,
      instanceId: result.instanceId,
      label: result.label,
      displayLabel: result.label,
      updated: true,
    };
  }
}
