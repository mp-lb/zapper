import { Context } from "../types/Context";
import { buildAliasMap } from "./buildAliasMap";
import { resolveAliasesToCanonical } from "./resolveAliasesToCanonical";

export function buildServiceAliasMap(context: Context) {
  return buildAliasMap(
    context.processes,
    context.containers.map((container) => [container.name, container]),
  );
}

export function resolveServiceTargets(
  context: Context,
  service?: string | string[],
): string | string[] | undefined {
  if (service === undefined) return undefined;

  const names = Array.isArray(service) ? service : [service];

  const resolved = resolveAliasesToCanonical(
    names,
    buildServiceAliasMap(context),
  );

  if (!resolved || resolved.length === 0) return undefined;
  return Array.isArray(service) ? resolved : resolved[0];
}
