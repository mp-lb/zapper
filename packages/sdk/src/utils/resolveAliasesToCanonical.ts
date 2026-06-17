import { AliasMap } from "./buildAliasMap";

export function resolveAliasesToCanonical(
  names: string[] | undefined,
  aliasMap: AliasMap,
): string[] | undefined {
  if (!names) return names;
  const canonical = names.map((n) => aliasMap[n] || n);
  return Array.from(new Set(canonical));
}
