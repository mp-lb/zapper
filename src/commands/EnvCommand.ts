import { CommandHandler, CommandContext } from "./CommandHandler";
import { StateManager } from "../core/StateManager";
import { Context } from "../types/Context";
import { CommandResult } from "./CommandResult";

export class EnvCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options } = context;
    if (Array.isArray(service)) {
      throw new Error(
        "Env command accepts a single environment or service name",
      );
    }

    const zapperContext = zapper.getContext();
    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    const environments = zapperContext.environments;

    // Environment management flags
    if (options.disable) {
      const stateManager = new StateManager(
        zapper,
        zapperContext.projectRoot,
        options.config,
      );
      return await this.disableEnvironment(
        stateManager,
        zapperContext.state.activeEnvironment,
      );
    }

    if (options.list) {
      return {
        kind: "environments.list",
        environments,
      };
    }

    const forcedService = options.service as string | undefined;
    const targetName = forcedService || service;

    if (targetName) {
      const isEnvironment = environments.includes(targetName);
      const resolvedServiceName = forcedService
        ? zapper.resolveServiceName(targetName)
        : isEnvironment
          ? targetName
          : zapper.resolveServiceName(targetName);
      const hasService = this.serviceExists(zapperContext, resolvedServiceName);

      if (forcedService) {
        return await this.showServiceEnv(zapperContext, resolvedServiceName);
      }

      if (isEnvironment && hasService) {
        throw new Error(
          `Ambiguous name: '${targetName}' matches both a service and an environment. Use --service ${targetName} to view env vars or choose a different environment name.`,
        );
      }

      if (isEnvironment) {
        const stateManager = new StateManager(
          zapper,
          zapperContext.projectRoot,
          options.config,
        );
        return await this.enableEnvironment(stateManager, targetName);
      }

      if (hasService) {
        return await this.showServiceEnv(zapperContext, resolvedServiceName);
      }

      throw new Error(
        `Not found: ${targetName}. Available environments: ${environments.join(", ")}`,
      );
    }

    return {
      kind: "environments.picker",
      environments,
      activeEnvironment: zapperContext.state.activeEnvironment,
    };
  }

  private serviceExists(context: Context, serviceName: string): boolean {
    return (
      context.processes.some((p) => p.name === serviceName) ||
      context.containers.some((c) => c.name === serviceName)
    );
  }

  private async showServiceEnv(
    zapperContext: Context,
    serviceName: string,
  ): Promise<CommandResult> {
    const process = zapperContext.processes.find((p) => p.name === serviceName);
    const container = zapperContext.containers.find(
      (c) => c.name === serviceName,
    );
    const target = process || container;

    if (!target) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    const resolvedEnv = target.resolvedEnv || {};
    return {
      kind: "env.service",
      resolvedEnv,
    };
  }

  private async enableEnvironment(
    stateManager: StateManager,
    environmentName: string,
  ): Promise<CommandResult> {
    await stateManager.setActiveEnvironment(environmentName);
    return {
      kind: "environments.enabled",
      environment: environmentName,
    };
  }

  private async disableEnvironment(
    stateManager: StateManager,
    currentActiveEnvironment?: string,
  ): Promise<CommandResult> {
    if (!currentActiveEnvironment) {
      return {
        kind: "environments.disabled",
      };
    }

    await stateManager.clearActiveEnvironment();
    return {
      kind: "environments.disabled",
      activeEnvironment: currentActiveEnvironment,
    };
  }
}
