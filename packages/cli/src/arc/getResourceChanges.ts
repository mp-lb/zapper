import { z } from "zod";

const planSchema = z.object({
  resource_changes: z
    .array(
      z.object({
        address: z.string(),
        mode: z.string(),
        change: z.object({ actions: z.array(z.string()) }),
      }),
    )
    .optional(),
});

export const getResourceChanges = (plan: unknown) =>
  (planSchema.parse(plan).resource_changes ?? [])
    .filter(
      (resource) =>
        resource.mode === "managed" &&
        resource.change.actions.some(
          (action) => action !== "no-op" && action !== "read",
        ),
    )
    .map(({ address, change }) => ({ address, actions: change.actions }));
