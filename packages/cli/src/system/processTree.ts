import { execSync } from "child_process";

export function parseParentMap(psOutput: string): Map<number, number> {
  const parents = new Map<number, number>();

  for (const line of psOutput.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    parents.set(Number(match[1]), Number(match[2]));
  }

  return parents;
}

export function listLiveParentMap(): Map<number, number> {
  try {
    const output = execSync("ps -axo pid=,ppid=", {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    });

    return parseParentMap(output);
  } catch {
    return new Map();
  }
}

/**
 * True when the PID, or any of its ancestors, is in the given set. PM2
 * membership must be judged by ancestry, not direct PID match: a managed
 * wrapper forks helper subshells that share its command line (e.g. the
 * stderr colorizer), and they are managed via their parent.
 */
export function pidBelongsToTree(
  pid: number,
  roots: Set<number>,
  parents: Map<number, number>,
): boolean {
  let current: number | undefined = pid;

  // Bounded walk in case of a cycle in stale ps output.
  for (let depth = 0; depth < 100 && current && current > 1; depth++) {
    if (roots.has(current)) return true;
    current = parents.get(current);
  }

  return false;
}
