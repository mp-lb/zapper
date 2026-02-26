import { AliasMap } from "./buildAliasMap";

export function resolveServiceName(name: string, aliasMap: AliasMap): string {
  return aliasMap[name] || name;
}
