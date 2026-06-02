import { CommandHandler, CommandContext } from "./CommandHandler";
import { Context } from "../types/Context";
import { CommandResult } from "./CommandResult";

export class EnvCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult | void> {
    const { zapper, service, options } = context;

    if (Array.isArray(service)) {
      throw new Error("Env command accepts a single service name");
    }

    const zapperContext = zapper.getContext();

    if (!zapperContext) {
      throw new Error("Context not loaded");
    }

    if (options.list) {
      throw new Error(
        "Environment switching was removed. Use profiles instead.",
      );
    }

    const forcedService = options.service as string | undefined;
    const targetName = forcedService || service;

    if (targetName) {
      const resolvedServiceName = zapper.resolveServiceName(targetName);
      const hasService = this.serviceExists(zapperContext, resolvedServiceName);

      if (forcedService) {
        return await this.showServiceEnv(zapperContext, resolvedServiceName);
      }

      if (hasService) {
        return await this.showServiceEnv(zapperContext, resolvedServiceName);
      }

      throw new Error(`Service '${targetName}' not found`);
    }

    throw new Error("Usage: zap env <service>");
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
}
