import { execSync } from "child_process";
import { listLiveParentMap, pidBelongsToTree } from "./processTree";

export interface WrapperOsProcess {
  pid: number;
  scriptPath: string;
}

// Matches a Zapper wrapper invocation: `<...>/bash <configDir>/.zap/<project>.<service>.<timestamp>.sh`.
// The wrapper script path is the only reliable marker that an OS process was
// started by Zapper, which lets us find survivors that the supervisor no longer
// manages (a daemon crash can orphan managed trees without killing them).
const WRAPPER_LINE_PATTERN =
  /^\s*(\d+)\s+\S*bash\s+(\S+\/\.zap\/[^\s/]+\.sh)(?:\s|$)/;

export function parseWrapperProcesses(psOutput: string): WrapperOsProcess[] {
  const processes: WrapperOsProcess[] = [];

  for (const line of psOutput.split("\n")) {
    const match = WRAPPER_LINE_PATTERN.exec(line);
    if (!match) continue;
    processes.push({ pid: Number(match[1]), scriptPath: match[2] });
  }

  return processes;
}

export const OrphanScanner = {
  /**
   * List OS processes that are running a Zapper `.zap/*.sh` wrapper script,
   * whether or not the supervisor still manages them.
   */
  listWrapperProcesses(): WrapperOsProcess[] {
    try {
      const output = execSync("ps -axo pid=,command=", {
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
      });

      return parseWrapperProcesses(output);
    } catch {
      return [];
    }
  },

  /**
   * Wrapper processes outside every supervisor-managed process tree, reduced to
   * tree roots. Ancestry matters twice here: a managed wrapper forks helper
   * subshells that share its command line (so direct PID comparison against
   * the supervisor table flags healthy services), and an orphaned tree's subshells
   * must be reported once via their root, not per process.
   */
  findUnmanagedWrapperRoots(managedPids: Set<number>): WrapperOsProcess[] {
    const parents = listLiveParentMap();

    const unmanaged = this.listWrapperProcesses().filter(
      (wrapper) => !pidBelongsToTree(wrapper.pid, managedPids, parents),
    );

    const unmanagedPids = new Set(unmanaged.map((wrapper) => wrapper.pid));

    return unmanaged.filter((wrapper) => {
      const parent = parents.get(wrapper.pid);
      return !parent || !pidBelongsToTree(parent, unmanagedPids, parents);
    });
  },
};
