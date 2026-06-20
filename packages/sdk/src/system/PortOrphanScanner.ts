import { execSync } from "child_process";
import fs from "fs";
import { loadPortsForInstance } from "../config/portsManager";
import { loadSystemRegistry } from "./SystemRegistry";
import { DEFAULT_INSTANCE_KEY } from "../core/instanceResolver";
import { listLiveParentMap, pidBelongsToTree } from "./processTree";

export interface ZapPortAssignment {
  project: string;
  instanceKey: string;
  instanceId: string;
  portName: string;
  port: number;
}

export interface OrphanPortListener extends ZapPortAssignment {
  pid: number;
  command: string;
}

interface PortListener {
  pid: number;
  command: string;
  port: number;
}

// Container runtimes publish container ports through their own proxy
// processes (Docker Desktop, OrbStack, Colima, Podman), which legitimately
// listen on zap-assigned ports without being supervisor-managed.
const DOCKER_COMMAND_PATTERN = /docker|vpnkit|orbstack|colima|podman|gvproxy/i;

export function parseLsofListeners(output: string): PortListener[] {
  const listeners: PortListener[] = [];
  let pid = 0;
  let command = "";
  const seen = new Set<string>();

  for (const line of output.split("\n")) {
    const field = line[0];
    const value = line.slice(1);

    if (field === "p") {
      pid = Number(value);
    } else if (field === "c") {
      command = value;
    } else if (field === "n") {
      const port = Number(value.slice(value.lastIndexOf(":") + 1));
      if (!port || !pid) continue;

      const key = `${pid}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      listeners.push({ pid, command, port });
    }
  }

  return listeners;
}

/**
 * Every zap-assigned port recorded in the state files of registered
 * projects/instances whose checkout still exists.
 */
export function listZapPortAssignments(): ZapPortAssignment[] {
  const registry = loadSystemRegistry();
  const assignments: ZapPortAssignment[] = [];

  for (const project of Object.values(registry.projects)) {
    if (!fs.existsSync(project.projectRoot)) continue;

    const instanceKeys = Object.keys(project.instances);

    for (const instanceKey of instanceKeys.length > 0
      ? instanceKeys
      : [DEFAULT_INSTANCE_KEY]) {
      let ports: Record<string, string>;

      try {
        ports = loadPortsForInstance(project.projectRoot, instanceKey);
      } catch {
        continue;
      }

      for (const [portName, value] of Object.entries(ports)) {
        const port = Number(value);
        if (!port) continue;

        assignments.push({
          project: project.project,
          instanceKey,
          instanceId: project.instances[instanceKey]?.id || "",
          portName,
          port,
        });
      }
    }
  }

  return assignments;
}

function listTcpListeners(): PortListener[] {
  try {
    const output = execSync("lsof -nP -iTCP -sTCP:LISTEN -F pcn", {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    });

    return parseLsofListeners(output);
  } catch {
    // lsof exits non-zero when nothing matches – treat as no listeners
    return [];
  }
}

export const PortOrphanScanner = {
  /**
   * Find processes listening on a zap-assigned port that do not belong to
   * any supervisor-managed process tree — survivors of a daemon kill. They hold
   * the port, so every later start of the owning service fails with "port
   * already in use" while the supervisor shows nothing running.
   *
   * `managedPids` are the supervisor's current process PIDs; `ignorePids` are roots of
   * trees already reported by another scan (to avoid double-reporting).
   */
  findOrphanPortListeners(
    managedPids: Set<number>,
    ignorePids: Set<number> = new Set(),
  ): OrphanPortListener[] {
    const assignments = listZapPortAssignments();
    if (assignments.length === 0) return [];

    const byPort = new Map<number, ZapPortAssignment>();

    for (const assignment of assignments) {
      byPort.set(assignment.port, assignment);
    }

    const listeners = listTcpListeners().filter((listener) =>
      byPort.has(listener.port),
    );

    if (listeners.length === 0) return [];

    const parents = listLiveParentMap();
    const orphans: OrphanPortListener[] = [];

    for (const listener of listeners) {
      if (DOCKER_COMMAND_PATTERN.test(listener.command)) continue;
      if (pidBelongsToTree(listener.pid, managedPids, parents)) continue;
      if (pidBelongsToTree(listener.pid, ignorePids, parents)) continue;

      orphans.push({
        ...byPort.get(listener.port)!,
        pid: listener.pid,
        command: listener.command,
      });
    }

    return orphans;
  },
};
