#!/usr/bin/env node

import { CommanderCli } from "./cli";
import {
  isPromptCancelledError,
  logger,
  LogLevel,
  renderer,
} from "@mp-lb/zapper-sdk";

declare const process: {
  argv: string[];
  exit: (code: number) => never;
};

const cli = new CommanderCli();

async function main() {
  try {
    await cli.parse(process.argv);
  } catch (error) {
    if (isPromptCancelledError(error)) {
      renderer.log.info(renderer.command.abortedText());
      process.exit(130);
    }

    const showStackTrace = logger.getLevel() === LogLevel.DEBUG;
    renderer.errors.print(error, showStackTrace);
    process.exit(1);
  }
}

main();
