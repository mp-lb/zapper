import { Process, Container } from "../config/schemas";

export interface AliasMap {
  [alias: string]: string;
}

export function buildAliasMap(
  processes: Process[],
  containers: Array<[string, Container]>,
): AliasMap {
  const aliasToName = new Map<string, string>();

  for (const p of processes) {
    aliasToName.set(p.name as string, p.name as string);
    if (Array.isArray(p.aliases)) {
      for (const a of p.aliases) aliasToName.set(a, p.name as string);
    }
  }

  for (const [name, c] of containers) {
    aliasToName.set(name, name);
    if (Array.isArray(c.aliases))
      for (const a of c.aliases) aliasToName.set(a, name);
  }

  return Object.fromEntries(aliasToName);
}
