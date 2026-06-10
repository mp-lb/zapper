import { execSync } from "child_process";

export interface WrapperOsProcess {
  pid: number;
  scriptPath: string;
}

// Matches a Zapper PM2 wrapper invocation: `<...>/bash <configDir>/.zap/<project>.<service>.<timestamp>.sh`.
// The wrapper script path is the only reliable marker that an OS process was
// started by Zapper, which lets us find survivors that PM2 no longer manages
// (a PM2 daemon crash orphans every managed tree without killing it).
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
   * whether or not PM2 still manages them.
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
};
