import { AliasMap } from "./buildAliasMap";

export function resolveAliasesToCanonical(
  names: string[] | undefined,
  aliasMap: AliasMap,
): string[] | undefined {
  if (!names) return names;
  return names.map((n) => aliasMap[n] || n);
}
