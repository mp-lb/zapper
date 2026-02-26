/* eslint-disable @typescript-eslint/no-explicit-any */
import { Zapper } from "../core/Zapper";
import { logger, LogLevel } from "../utils/logger";
import { CommandResult } from "./CommandResult";

export interface TaskParams {
  named: Record<string, string>;
  rest: string[];
}

export type CommandTarget = string | string[];

export interface CommandContext {
  zapper: Zapper;
  service?: CommandTarget;
  options: Record<string, any>;
  taskParams?: TaskParams;
}

export abstract class CommandHandler {
  protected async setupZapper(config?: string): Promise<Zapper> {
    const zapper = new Zapper();
    await zapper.loadConfig(config);
    return zapper;
  }

  protected configureLogging(options: Record<string, any>): void {
    if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (options.verbose) {
      logger.setLevel(LogLevel.INFO);
    } else if (options.quiet) {
      logger.setLevel(LogLevel.WARN);
    }
  }

  abstract execute(context: CommandContext): Promise<CommandResult | void>;
}
