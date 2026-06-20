import { spawn } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "fs";
import net from "net";
import { fileURLToPath } from "url";
import {
  SupervisorProcessRecord,
  SupervisorRequestPayload,
  SupervisorResponse,
  SupervisorStartOptions,
  supervisorHome,
  supervisorLogPath,
  supervisorSocketPath,
} from "./ZapperSupervisorProtocol";

const REQUEST_TIMEOUT_MS = 5000;
const START_TIMEOUT_MS = 5000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daemonEntryPoint(): string {
  return fileURLToPath(new URL("./ZapperSupervisorDaemon.js", import.meta.url));
}

export class ZapperSupervisorClient {
  private static requestId = 0;

  static async start(options: SupervisorStartOptions): Promise<void> {
    await this.request({ method: "start", options });
  }

  static async stop(name: string): Promise<void> {
    await this.request({ method: "stop", name });
  }

  static async restart(name: string): Promise<void> {
    await this.request({ method: "restart", name });
  }

  static async delete(name: string): Promise<void> {
    await this.request({ method: "delete", name });
  }

  static async list(): Promise<SupervisorProcessRecord[]> {
    return (await this.request({
      method: "list",
    })) as SupervisorProcessRecord[];
  }

  static async shutdown(): Promise<void> {
    await this.request({ method: "shutdown" });
  }

  private static async request(
    request: SupervisorRequestPayload,
  ): Promise<unknown> {
    await this.ensureDaemon();

    const id = `${Date.now()}-${++this.requestId}`;
    const payload = JSON.stringify({ id, ...request }) + "\n";

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(supervisorSocketPath());
      let response = "";

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Zapper supervisor request timed out"));
      }, REQUEST_TIMEOUT_MS);

      socket.on("connect", () => {
        socket.write(payload);
      });

      socket.on("data", (chunk) => {
        response += chunk.toString();
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      socket.on("end", () => {
        clearTimeout(timeout);

        try {
          if (!response.trim()) {
            reject(new Error("Zapper supervisor returned an empty response"));
            return;
          }

          const parsed = JSON.parse(response) as SupervisorResponse;

          if (!parsed.ok) {
            reject(
              new Error(parsed.error || "Zapper supervisor request failed"),
            );

            return;
          }

          resolve(parsed.result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private static async ensureDaemon(): Promise<void> {
    if (await this.canConnect()) return;

    if (process.platform !== "win32" && existsSync(supervisorSocketPath())) {
      rmSync(supervisorSocketPath(), { force: true });
    }

    mkdirSync(supervisorHome(), { recursive: true });

    const logFd = openSync(supervisorLogPath(), "a");
    const child = spawn(process.execPath, [daemonEntryPoint()], {
      detached: true,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
    });

    closeSync(logFd);
    child.unref();

    const startedAt = Date.now();

    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      if (await this.canConnect()) return;
      await delay(100);
    }

    throw new Error(
      `Zapper supervisor did not start. Check ${supervisorLogPath()}.`,
    );
  }

  private static canConnect(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(supervisorSocketPath());
      const id = `ping-${Date.now()}-${++this.requestId}`;
      let response = "";

      const done = (ok: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(ok);
      };

      socket.once("connect", () => {
        socket.write(JSON.stringify({ id, method: "ping" }) + "\n");
      });

      socket.on("data", (chunk) => {
        response += chunk.toString();
      });

      socket.once("end", () => {
        try {
          const parsed = JSON.parse(response) as SupervisorResponse;
          done(parsed.ok && parsed.result === "pong");
        } catch {
          done(false);
        }
      });

      socket.once("error", () => done(false));
      socket.setTimeout(500, () => done(false));
    });
  }
}
