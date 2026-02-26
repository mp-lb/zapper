/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

export const duplicateValidation = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((config: any, ctx) => {
    const seen = new Map<string, string>();
    const duplicates = new Set<string>();

    const add = (id: string, where: string) => {
      if (seen.has(id)) {
        duplicates.add(id);
        return;
      }
      seen.set(id, where);
    };

    if (config.native) {
      for (const [name, proc] of Object.entries(config.native)) {
        add(name, `native['${name}']`);
        if ((proc as any).aliases) {
          for (const alias of (proc as any).aliases) {
            add(alias, `native['${name}'].aliases`);
          }
        }
      }
    }

    const containers = config.docker || config.containers;
    if (containers) {
      for (const [name, container] of Object.entries(containers)) {
        add(name, `docker['${name}']`);
        if ((container as any).aliases) {
          for (const alias of (container as any).aliases) {
            add(alias, `docker['${name}'].aliases`);
          }
        }
      }
    }

    if (duplicates.size > 0) {
      const duplicateList = [...duplicates].sort().join(", ");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate service identifier(s): ${duplicateList}. Names and aliases must be globally unique across native and docker`,
      });
    }
  });
