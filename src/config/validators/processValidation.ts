/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

export const processValidation = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (config: any) => {
      const hasNative = config.native && Object.keys(config.native).length > 0;
      const hasLegacyProcesses =
        config.processes && config.processes.length > 0;
      const hasDocker =
        (config.docker && Object.keys(config.docker).length > 0) ||
        (config.containers && Object.keys(config.containers).length > 0);

      return hasNative || hasLegacyProcesses || hasDocker;
    },
    {
      message:
        "No processes defined. Define at least one in native, docker, or processes",
    },
  );
