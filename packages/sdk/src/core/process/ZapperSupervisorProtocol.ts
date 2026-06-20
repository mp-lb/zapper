import os from "os";
import path from "path";

export interface SupervisorStartOptions {
  name: string;
  script: string;
  interpreter: string;
  cwd: string;
  env: Record<string, string>;
  logFile: string;
  autorestart: boolean;
  maxRestarts: number;
  minUptime: number;
  restartBackoffMs: number;
}

export interface SupervisorProcessRecord extends SupervisorStartOptions {
  pid: number;
  status: "online" | "stopped" | "errored" | "stopping" | "waiting restart";
  uptime: number;
  memory: number;
  cpu: number;
  restarts: number;
  createdAt: number;
  startedAt: number;
  unstableRestarts: number;
  previousRestartDelay: number;
  exitCode?: number | null;
}

export type SupervisorRequest =
  | { id: string; method: "ping" }
  | { id: string; method: "start"; options: SupervisorStartOptions }
  | { id: string; method: "stop"; name: string }
  | { id: string; method: "restart"; name: string }
  | { id: string; method: "delete"; name: string }
  | { id: string; method: "list" }
  | { id: string; method: "shutdown" };

export type SupervisorRequestPayload =
  | { method: "ping" }
  | { method: "start"; options: SupervisorStartOptions }
  | { method: "stop"; name: string }
  | { method: "restart"; name: string }
  | { method: "delete"; name: string }
  | { method: "list" }
  | { method: "shutdown" };

export interface SupervisorResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export function supervisorHome(): string {
  return path.join(os.homedir(), ".zapper", "supervisor");
}

export function supervisorStatePath(): string {
  return path.join(supervisorHome(), "state.json");
}

export function supervisorLogPath(): string {
  return path.join(supervisorHome(), "daemon.log");
}

export function supervisorSocketPath(): string {
  if (process.platform === "win32") {
    return "\\\\.\\pipe\\zapper-supervisor";
  }

  return path.join(os.tmpdir(), `zapper-supervisor-${os.userInfo().uid}.sock`);
}
