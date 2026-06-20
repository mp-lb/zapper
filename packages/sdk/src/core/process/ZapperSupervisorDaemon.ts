import { spawn } from "child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import net from "net";
import os from "os";
import path from "path";
import {
  SupervisorProcessRecord,
  SupervisorRequest,
  SupervisorResponse,
  SupervisorStartOptions,
  supervisorHome,
  supervisorLogPath,
  supervisorSocketPath,
  supervisorStatePath,
} from "./ZapperSupervisorProtocol";

interface RuntimeRecord extends SupervisorProcessRecord {
  child?: ReturnType<typeof spawn>;
  restartTimer?: NodeJS.Timeout;
  stableTimer?: NodeJS.Timeout;
}

class ZapperSupervisorDaemon {
  private readonly records = new Map<string, RuntimeRecord>();
  private server?: net.Server;

  start(): void {
    mkdirSync(supervisorHome(), { recursive: true });
    this.log(`starting supervisor pid=${process.pid}`);
    this.loadState();

    if (process.platform !== "win32" && existsSync(supervisorSocketPath())) {
      rmSync(supervisorSocketPath(), { force: true });
    }

    this.server = net.createServer((socket) => this.handleSocket(socket));
    this.server.on("error", (error) => {
      this.log(`server error: ${error.message}`);
    });

    this.server.listen(supervisorSocketPath(), () => {
      if (process.platform !== "win32") {
        try {
          process.umask();
        } catch {
          // noop
        }
      }

      this.log(`listening on ${supervisorSocketPath()}`);
    });

    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  private async handleSocket(socket: net.Socket): Promise<void> {
    let body = "";
    let handled = false;

    const handleBody = async () => {
      if (handled) return;
      handled = true;

      let id = "unknown";

      try {
        if (!body.trim()) {
          socket.end();
          return;
        }

        const request = JSON.parse(body) as SupervisorRequest;
        id = request.id;
        const result = await this.handleRequest(request);
        this.writeResponse(socket, { id, ok: true, result });
      } catch (error) {
        this.writeResponse(socket, {
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    socket.on("error", (error) => {
      this.log(`socket error: ${error.message}`);
    });

    socket.on("data", (chunk) => {
      body += chunk.toString();
      if (body.includes("\n")) {
        body = body.slice(0, body.indexOf("\n"));
        void handleBody();
      }
    });

    socket.on("end", () => {
      void handleBody();
    });
  }

  private async handleRequest(request: SupervisorRequest): Promise<unknown> {
    switch (request.method) {
      case "ping":
        return "pong";
      case "start":
        await this.startProcess(request.options);
        return null;
      case "stop":
        await this.stopProcess(request.name, false);
        return null;
      case "restart":
        await this.restartProcess(request.name);
        return null;
      case "delete":
        await this.deleteProcess(request.name);
        return null;
      case "list":
        this.refreshStatuses();
        return Array.from(this.records.values()).map((record) =>
          this.publicRecord(record),
        );
      case "shutdown":
        setTimeout(() => this.shutdown(), 10);
        return null;
    }
  }

  private writeResponse(
    socket: net.Socket,
    response: SupervisorResponse,
  ): void {
    if (socket.destroyed) return;

    socket.end(JSON.stringify(response));
  }

  private async startProcess(options: SupervisorStartOptions): Promise<void> {
    await this.deleteProcess(options.name);

    const now = Date.now();

    const record: RuntimeRecord = {
      ...options,
      pid: 0,
      status: "stopped",
      uptime: 0,
      memory: 0,
      cpu: 0,
      restarts: 0,
      createdAt: now,
      startedAt: 0,
      unstableRestarts: 0,
      previousRestartDelay: 0,
      exitCode: null,
    };

    this.records.set(options.name, record);
    this.spawnRecord(record);
  }

  private spawnRecord(record: RuntimeRecord): void {
    mkdirSync(os.tmpdir(), { recursive: true });
    mkdirSync(supervisorHome(), { recursive: true });
    mkdirSync(path.dirname(record.logFile), { recursive: true });

    const logFd = openSync(record.logFile, "a");

    const child = spawn(record.interpreter, [record.script], {
      cwd: record.cwd,
      detached: true,
      env: { ...process.env, ...record.env },
      stdio: ["ignore", logFd, logFd],
    });

    closeSync(logFd);

    record.child = child;
    record.pid = child.pid || 0;
    record.status = "online";
    record.startedAt = Date.now();
    record.uptime = 0;
    record.exitCode = null;
    this.persist();

    if (record.stableTimer) clearTimeout(record.stableTimer);
    record.stableTimer = setTimeout(() => {
      record.unstableRestarts = 0;
      record.previousRestartDelay = 0;
      this.persist();
    }, record.minUptime);

    child.on("exit", (code) => {
      record.child = undefined;
      record.pid = 0;
      record.exitCode = code;
      this.handleExit(record);
    });

    child.on("error", (error) => {
      this.log(`failed to spawn ${record.name}: ${error.message}`);
      record.child = undefined;
      record.pid = 0;
      record.exitCode = 1;
      this.handleExit(record);
    });
  }

  private handleExit(record: RuntimeRecord): void {
    if (record.stableTimer) clearTimeout(record.stableTimer);

    const uptime = Date.now() - record.startedAt;
    record.uptime = uptime;

    if (record.status === "stopping" || !record.autorestart) {
      record.status = "stopped";
      this.persist();
      return;
    }

    if (uptime < record.minUptime) {
      record.unstableRestarts += 1;
    }

    if (record.unstableRestarts >= record.maxRestarts) {
      record.status = "errored";
      record.unstableRestarts = 0;
      this.persist();
      return;
    }

    const delay = this.nextRestartDelay(record);
    record.status = "waiting restart";
    this.persist();

    record.restartTimer = setTimeout(() => {
      record.restarts += 1;
      this.spawnRecord(record);
    }, delay);
  }

  private nextRestartDelay(record: RuntimeRecord): number {
    if (!record.restartBackoffMs) return 0;

    if (!record.previousRestartDelay) {
      record.previousRestartDelay = record.restartBackoffMs;
      return record.restartBackoffMs;
    }

    record.previousRestartDelay = Math.floor(
      Math.min(15000, record.previousRestartDelay * 1.5),
    );

    return record.previousRestartDelay;
  }

  private async stopProcess(
    name: string,
    keepRegistration: boolean,
  ): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;

    record.status = "stopping";
    if (record.restartTimer) clearTimeout(record.restartTimer);
    if (record.stableTimer) clearTimeout(record.stableTimer);

    if (record.pid > 0) {
      await this.killProcessTree(record.pid);
    }

    record.pid = 0;
    record.status = "stopped";
    record.child = undefined;

    if (!keepRegistration) {
      this.records.delete(name);
    }

    this.persist();
  }

  private async restartProcess(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;

    const options = this.startOptions(record);
    await this.stopProcess(name, true);

    const nextRecord = this.records.get(name);

    if (!nextRecord) {
      this.records.set(name, {
        ...options,
        pid: 0,
        status: "stopped",
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: record.restarts,
        createdAt: record.createdAt,
        startedAt: 0,
        unstableRestarts: 0,
        previousRestartDelay: 0,
        exitCode: null,
      });
    }

    const restarted = this.records.get(name);
    if (!restarted) return;
    restarted.restarts += 1;
    this.spawnRecord(restarted);
  }

  private async deleteProcess(name: string): Promise<void> {
    await this.stopProcess(name, false);
  }

  private startOptions(record: RuntimeRecord): SupervisorStartOptions {
    return {
      name: record.name,
      script: record.script,
      interpreter: record.interpreter,
      cwd: record.cwd,
      env: record.env,
      logFile: record.logFile,
      autorestart: record.autorestart,
      maxRestarts: record.maxRestarts,
      minUptime: record.minUptime,
      restartBackoffMs: record.restartBackoffMs,
    };
  }

  private async killProcessTree(pid: number): Promise<void> {
    if (!pid || pid <= 1) return;

    try {
      if (process.platform !== "win32") {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          process.kill(pid, "SIGTERM");
        }
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // Already gone.
    }

    await new Promise((resolve) => setTimeout(resolve, 700));

    if (!this.isProcessGroupAlive(pid) && !this.isPidAlive(pid)) return;

    try {
      if (process.platform !== "win32") {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          process.kill(pid, "SIGKILL");
        }
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      // Already gone.
    }
  }

  private refreshStatuses(): void {
    let changed = false;

    for (const record of this.records.values()) {
      if (record.pid > 0 && !this.isPidAlive(record.pid)) {
        record.pid = 0;

        if (record.status === "online") {
          record.status = "stopped";
        }

        changed = true;
      }

      record.uptime =
        record.status === "online" && record.startedAt > 0
          ? Date.now() - record.startedAt
          : record.uptime;
    }

    if (changed) this.persist();
  }

  private publicRecord(record: RuntimeRecord): SupervisorProcessRecord {
    const { child, restartTimer, stableTimer, ...plain } = record;
    void child;
    void restartTimer;
    void stableTimer;

    return {
      ...plain,
      uptime:
        plain.status === "online" && plain.startedAt > 0
          ? Date.now() - plain.startedAt
          : plain.uptime,
    };
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private isProcessGroupAlive(pgid: number): boolean {
    if (process.platform === "win32") return false;

    try {
      process.kill(-pgid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private loadState(): void {
    if (!existsSync(supervisorStatePath())) return;

    try {
      const records = JSON.parse(
        readFileSync(supervisorStatePath(), "utf8"),
      ) as SupervisorProcessRecord[];

      for (const record of records) {
        this.records.set(record.name, { ...record });
      }

      this.refreshStatuses();
    } catch (error) {
      this.log(`failed to load state: ${String(error)}`);
    }
  }

  private persist(): void {
    const records = Array.from(this.records.values()).map((record) =>
      this.publicRecord(record),
    );

    writeFileSync(supervisorStatePath(), JSON.stringify(records, null, 2));
  }

  private shutdown(): void {
    this.log("shutting down supervisor");
    this.persist();
    this.server?.close();

    if (process.platform !== "win32" && existsSync(supervisorSocketPath())) {
      rmSync(supervisorSocketPath(), { force: true });
    }

    process.exit(0);
  }

  private log(message: string): void {
    appendFileSync(
      supervisorLogPath(),
      `[${new Date().toISOString()}] ${message}\n`,
    );
  }
}

new ZapperSupervisorDaemon().start();
