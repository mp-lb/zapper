import { execSync } from "child_process";

export interface NativeProcessEntry {
  name: string;
}

interface GlobalListProject {
  name: string;
  nativeProcesses?: string[];
}

interface GlobalListResult {
  projects?: GlobalListProject[];
}

function runZapJson(cliPath: string, command: string, cwd: string): unknown {
  const output = execSync(`node "${cliPath}" ${command} --json`, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15000,
  });

  return JSON.parse(output);
}

export function listNativeProcesses(
  cliPath: string,
  cwd: string,
  projectName?: string,
): NativeProcessEntry[] {
  const result = runZapJson(
    cliPath,
    projectName ? `global list ${projectName}` : "global list",
    cwd,
  ) as GlobalListResult;

  return (result.projects || []).flatMap((project) =>
    (project.nativeProcesses || []).map((name) => ({ name })),
  );
}

export function cleanupNativeProcesses(
  cliPath: string,
  cwd: string,
  projectName: string,
): void {
  try {
    runZapJson(cliPath, `global kill ${projectName} --force`, cwd);
  } catch {
    // Ignore cleanup errors; the project may have no remaining resources.
  }
}
