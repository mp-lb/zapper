import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
} from "fs";
import path from "path";
import * as pm2Module from "pm2";
import { Process } from "../../config/schemas";
import { ProcessInfo } from "../../types/index";
import { renderer } from "../../ui/renderer";
import { buildServiceName } from "../../utils/nameBuilder";
import { resolveBashRuntime, resolveTailRuntime } from "../../runtime";
import { OrphanScanner } from "../../system/OrphanScanner";
import { captureShellEnv } from "./shellEnvCapture";

interface ShellCapture {
  shell: string;
  env: Record<string, string>;
}

interface Pm2Callback<T = unknown> {
  (error: Error | null, result?: T): void;
}

interface Pm2ApiProcess {
  name?: string;
  pid?: number;
  monit?: {
    memory?: number;
    cpu?: number;
  };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
    pm_cwd?: string;
    pm_exec_path?: string;
  };
}

interface Pm2StartOptions {
  name: string;
  script: string;
  interpreter: string;
  cwd: string;
  env: Record<string, string | number | boolean>;
  out_file: string;
  error_file: string;
  logFile?: string;
  merge_logs: boolean;
  autorestart: boolean;
  max_restarts: number;
  maxRestarts: number;
  min_uptime: number;
  minUptime: number;
  exp_backoff_restart_delay: number;
  restartBackoffMs: number;
}

interface Pm2Api {
  connect(callback: Pm2Callback<void>): void;
  disconnect(): void;
  start(arg: Pm2StartOptions | string, callback: Pm2Callback): void;
  stop(name: string, callback: Pm2Callback): void;
  restart(name: string, callback: Pm2Callback): void;
  delete(name: string, callback: Pm2Callback): void;
  list(callback: Pm2Callback<Pm2ApiProcess[]>): void;
  dump(callback: Pm2Callback): void;
  resurrect(callback: Pm2Callback): void;
  killDaemon(callback: Pm2Callback): void;
}

const pm2 = ((pm2Module as { default?: unknown }).default ??
  pm2Module) as Pm2Api;

const PM2_API_TIMEOUT_MS = 15_000;

export class Pm2Manager {
  static async startProcess(
    processConfig: Process,
    projectName: string,
    instanceId?: string | null,
  ): Promise<void> {
    // Always use ecosystem approach for consistency
    await this.startProcessWithTempEcosystem(
      projectName,
      processConfig,
      globalThis.process?.cwd(),
      instanceId,
    );
  }

  static async startProcessWithTempEcosystem(
    projectName: string,
    processConfig: Process,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    if (!configDir) {
      throw new Error("Config directory is required for process management");
    }

    // Delete any existing processes with the same name to prevent duplicates
    await this.deleteAllMatchingProcesses(
      processConfig.name as string,
      projectName,
      configDir,
      instanceId,
    );

    const zapDir = path.join(configDir, ".zap");
    const logsDir = path.join(zapDir, "logs");
    mkdirSync(logsDir, { recursive: true });

    // Clean up old wrapper scripts before creating a new one
    this.cleanupWrapperScripts(
      projectName,
      processConfig.name as string,
      configDir,
      instanceId,
    );

    const shellCapture = await this.resolveShellCapture(processConfig);

    // Create a minimal wrapper script for PM2 to execute.
    const wrapperScript = this.createWrapperScript(
      projectName,
      processConfig,
      configDir,
      instanceId,
      shellCapture,
    );

    renderer.log.debug(
      `Creating ecosystem for ${processConfig.name as string} with env whitelist:`,
      { data: processConfig.env },
    );

    renderer.log.debug(`Final env for PM2 process:`, {
      data: processConfig.resolvedEnv,
    });

    const appConfig = this.createPm2StartOptions(
      projectName,
      processConfig,
      configDir,
      wrapperScript,
      instanceId,
    );

    const ecosystemJson = JSON.stringify({ apps: [appConfig] }, null, 2);
    renderer.log.debug(`Ecosystem JSON for ${processConfig.name as string}:`);
    renderer.log.debug("─".repeat(50));
    renderer.log.debug(ecosystemJson);
    renderer.log.debug("─".repeat(50));

    await this.startPm2Process(appConfig);
  }

  static async startProcessFromEcosystem(ecosystemPath: string): Promise<void> {
    const ecosystem = JSON.parse(readFileSync(ecosystemPath, "utf8")) as {
      apps?: Pm2StartOptions[];
    };

    const app = ecosystem.apps?.[0];
    if (!app) throw new Error(`No app found in ecosystem: ${ecosystemPath}`);
    await this.startPm2Process(app);
  }

  private static createPm2StartOptions(
    projectName: string,
    processConfig: Process,
    configDir: string,
    wrapperScript: string,
    instanceId?: string | null,
  ): Pm2StartOptions {
    return {
      name: buildServiceName(
        projectName,
        processConfig.name as string,
        instanceId,
      ),
      script: wrapperScript,
      interpreter: resolveBashRuntime([]).command,
      cwd: this.resolveProcessCwd(processConfig, configDir),
      env: processConfig.resolvedEnv || {},
      // PM2 7 ignores the `log` attribute; out_file/error_file are the
      // supported way to get a combined managed log file.
      out_file: this.managedLogFilePath(
        projectName,
        processConfig.name as string,
        configDir,
        instanceId,
      ),
      error_file: this.managedLogFilePath(
        projectName,
        processConfig.name as string,
        configDir,
        instanceId,
      ),
      logFile: this.managedLogFilePath(
        projectName,
        processConfig.name as string,
        configDir,
        instanceId,
      ),
      merge_logs: true,
      // Limit restarts for faster feedback in local development
      // Instead of infinite retries, fail fast after 2 attempts.
      autorestart: true,
      max_restarts: 2,
      maxRestarts: 2,
      min_uptime: 4000,
      minUptime: 4000,
      // Backoff throttles late-onset crash loops; it resets once the app runs
      // stably again.
      exp_backoff_restart_delay: 100,
      restartBackoffMs: 100,
    };
  }

  private static resolveProcessCwd(
    processConfig: Process,
    configDir: string,
  ): string {
    if (!processConfig.cwd) return configDir;

    const resolved = path.isAbsolute(processConfig.cwd)
      ? processConfig.cwd
      : path.join(configDir, processConfig.cwd);

    if (!existsSync(resolved)) {
      renderer.log.warn(
        `cwd path does not exist for ${processConfig.name as string}: ${resolved} (skipping)`,
      );

      return configDir;
    }

    return resolved;
  }

  private static startPm2Process(appConfig: Pm2StartOptions): Promise<void> {
    return this.pm2Action("start", appConfig);
  }

  private static async pm2Action(
    method: string,
    arg?: Pm2StartOptions | string,
    retryCount = 0,
  ): Promise<any> {
    renderer.log.debug(`Running PM2 API action: ${method}`);

    try {
      await this.pm2Connect();

      return await this.pm2ActionResult(method, arg);
    } catch (error) {
      const message = String(error);

      const isStateCorruption =
        message.includes("Process") &&
        message.includes("not found") &&
        message.includes("Cannot read properties of undefined");

      const isVersionMismatch = message.includes(
        "In-memory PM2 is out-of-date",
      );

      if ((isStateCorruption || isVersionMismatch) && retryCount === 0) {
        renderer.log.warn(
          isVersionMismatch
            ? `PM2 daemon/API version mismatch detected, restarting the PM2 daemon...`
            : `PM2 state corruption detected, restarting the PM2 daemon...`,
        );

        try {
          await this.recoverPm2Daemon();
          return await this.pm2Action(method, arg, 1);
        } catch (resetError) {
          renderer.log.warn(`PM2 recovery failed: ${resetError}`);
        }
      }

      throw error;
    } finally {
      this.pm2Disconnect();
    }
  }

  private static pm2Connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private static pm2Disconnect(): void {
    try {
      pm2.disconnect();
    } catch {
      // Preserve the action's real result; disconnect failures are cleanup.
    }
  }

  private static pm2ActionResult(
    method: string,
    arg?: Pm2StartOptions | string,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `PM2 API action timed out after ${PM2_API_TIMEOUT_MS}ms: ${method}`,
          ),
        );
      }, PM2_API_TIMEOUT_MS);

      const callback: Pm2Callback = (error, result) => {
        clearTimeout(timeout);

        if (error) reject(error);
        else resolve(result ?? []);
      };

      switch (method) {
        case "start":
          pm2.start(arg as Pm2StartOptions | string, callback);
          break;
        case "stop":
          pm2.stop(String(arg), callback);
          break;
        case "restart":
          pm2.restart(String(arg), callback);
          break;
        case "delete":
          pm2.delete(String(arg), callback);
          break;
        case "list":
          pm2.list(callback as Pm2Callback<Pm2ApiProcess[]>);
          break;
        case "dump":
          pm2.dump(callback);
          break;
        case "resurrect":
          pm2.resurrect(callback);
          break;
        case "killDaemon":
          pm2.killDaemon(callback);
          break;
        default:
          clearTimeout(timeout);
          reject(new Error(`Unsupported PM2 API action: ${method}`));
      }
    });
  }

  private static toProcessInfo(proc: Pm2ApiProcess): ProcessInfo {
    return {
      name: proc.name || "",
      pid: proc.pid || 0,
      status: proc.pm2_env?.status || "unknown",
      uptime: proc.pm2_env?.pm_uptime || 0,
      memory: proc.monit?.memory || 0,
      cpu: proc.monit?.cpu || 0,
      restarts: proc.pm2_env?.restart_time || 0,
      cwd: proc.pm2_env?.pm_cwd,
      script: proc.pm2_env?.pm_exec_path,
    };
  }

  /**
   * Kill an entire process tree rooted at the given PID.
   * Uses `kill -TERM -<pgid>` to signal the process group first because
   * Zapper-supervised wrappers are started as detached process-group leaders.
   */
  private static killProcessTree(pid: number): void {
    if (!pid || pid <= 1) return;

    try {
      // Try to kill the entire process group (negative PID)
      try {
        globalThis.process.kill(-pid, "SIGTERM");
        renderer.log.debug(`Killed process group for PID ${pid}`);
      } catch {
        // Process group kill may fail if the process isn't a group leader.
        // Fall back to finding and killing children individually.
        renderer.log.debug(
          `Process group kill failed for PID ${pid}, killing children individually`,
        );
      }

      // Finally kill the root process itself
      try {
        globalThis.process.kill(pid, "SIGTERM");
      } catch {
        // Already dead – ignore
      }
    } catch (error) {
      renderer.log.warn(`Error killing process tree for PID ${pid}: ${error}`);
    }
  }

  /**
   * Kill the process tree of an orphan Zapper wrapper that PM2 no longer
   * manages.
   */
  static killDetachedProcessTree(pid: number): void {
    this.killProcessTree(pid);
  }

  static async stopProcess(
    name: string,
    projectName?: string,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    const prefixedName = projectName
      ? buildServiceName(projectName, name, instanceId)
      : name;

    await this.pm2Action("stop", prefixedName);

    if (projectName) {
      await this.cleanupLogs(projectName, name, configDir, instanceId);
      this.cleanupWrapperScripts(projectName, name, configDir, instanceId);
    }
  }

  static async restartProcess(
    name: string,
    projectName?: string,
    instanceId?: string | null,
  ): Promise<void> {
    const prefixedName = projectName
      ? buildServiceName(projectName, name, instanceId)
      : name;

    const info = await this.getProcessInfo(prefixedName);

    if (info && this.hasMissingWrapperScript(info)) {
      await this.pm2Action("delete", prefixedName);

      throw new Error(
        `Cannot restart ${prefixedName}: its wrapper script no longer exists (${info.script}). ` +
          `The registration was removed from PM2 to prevent a crash loop; start the service again to recreate it.`,
      );
    }

    await this.pm2Action("restart", prefixedName);
  }

  /**
   * A registration whose .zap wrapper script is gone can only crash-loop.
   * Such an app must be deregistered, never started or restarted.
   */
  static hasMissingWrapperScript(info: Pick<ProcessInfo, "script">): boolean {
    return Boolean(
      info.script &&
      /\/\.zap\/[^/]+\.sh$/.test(info.script) &&
      !existsSync(info.script),
    );
  }

  /**
   * Deregister every supervised app whose Zapper wrapper script no longer
   * exists on disk. Returns the names that were removed.
   */
  static async deregisterMissingScriptApps(): Promise<string[]> {
    const processes = await this.listProcesses();
    const removed: string[] = [];

    for (const proc of processes) {
      if (!this.hasMissingWrapperScript(proc)) continue;

      renderer.log.warn(
        `Deregistering ${proc.name}: wrapper script no longer exists (${proc.script})`,
      );

      try {
        await this.pm2Action("delete", proc.name, 1);
        removed.push(proc.name);
      } catch (error) {
        renderer.log.warn(`Failed to deregister ${proc.name}: ${error}`);
      }
    }

    return removed;
  }

  /**
   * Stop and deregister every supervised app whose wrapper script lives under the
   * given .zap directory — all stacks and instances of that local copy, not
   * just the current one. Must run before the directory is deleted, so no
   * registration is left pointing at a missing script (which would
   * crash-loop unbounded).
   */
  static async deregisterAppsUnderZapDir(zapDir: string): Promise<string[]> {
    const prefix = path.resolve(zapDir) + path.sep;
    const processes = await this.listProcesses();
    const removed: string[] = [];

    for (const proc of processes) {
      if (!proc.script || !path.resolve(proc.script).startsWith(prefix)) {
        continue;
      }

      try {
        await this.pm2Action("delete", proc.name);
        removed.push(proc.name);
      } catch (error) {
        renderer.log.warn(`Failed to deregister ${proc.name}: ${error}`);
      }
    }

    return removed;
  }

  static async deleteProcess(
    name: string,
    projectName?: string,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    const prefixedName = projectName
      ? buildServiceName(projectName, name, instanceId)
      : name;

    await this.pm2Action("delete", prefixedName);

    if (projectName) {
      await this.cleanupLogs(projectName, name, configDir, instanceId);
      this.cleanupWrapperScripts(projectName, name, configDir, instanceId);
    }
  }

  static async deleteAllMatchingProcesses(
    name: string,
    projectName?: string,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    const prefixedName = projectName
      ? buildServiceName(projectName, name, instanceId)
      : name;

    try {
      const processes = await this.listProcesses();

      const matchingProcesses = processes.filter(
        (p) => p.name === prefixedName,
      );

      if (matchingProcesses.length === 0) {
        renderer.log.debug(`No processes found matching ${prefixedName}`);
        return;
      }

      renderer.log.debug(
        `Deleting ${matchingProcesses.length} process(es) matching ${prefixedName}`,
      );

      for (const proc of matchingProcesses) {
        await this.pm2Action("delete", proc.name);
      }

      if (projectName) {
        await this.cleanupLogs(projectName, name, configDir, instanceId);
        this.cleanupWrapperScripts(projectName, name, configDir, instanceId);
      }
    } catch (error) {
      renderer.log.warn(`Error deleting processes: ${error}`);
    }
  }

  private static async cleanupLogs(
    projectName: string,
    processName: string,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    try {
      const { rmSync, unlinkSync, existsSync } = await import("fs");
      const logsDir = path.join(configDir || ".", ".zap", "logs");

      // Remove the combined log file. The path is stack-namespaced so one
      // stack's cleanup can never delete another stack's logs.
      const logPath = this.managedLogFilePath(
        projectName,
        processName,
        configDir,
        instanceId,
      );

      if (existsSync(logPath)) {
        unlinkSync(logPath);
        renderer.log.debug(`Cleaned up log: ${logPath}`);
      }

      // Try to remove the logs directory if it's empty
      try {
        const { readdirSync } = await import("fs");
        const remainingFiles = readdirSync(logsDir);

        if (remainingFiles.length === 0) {
          rmSync(logsDir, { recursive: true, force: true });
          renderer.log.debug(`Cleaned up empty logs directory: ${logsDir}`);
        }
      } catch {
        // Directory not empty or other error, that's fine
      }
    } catch (error) {
      // Log cleanup errors but don't fail the operation
      renderer.log.warn(`Failed to clean up logs: ${error}`);
    }
  }

  private static cleanupWrapperScripts(
    projectName: string,
    processName: string,
    configDir?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _instanceId?: string | null,
  ): void {
    try {
      const zapDir = path.join(configDir || ".", ".zap");
      if (!existsSync(zapDir)) return;

      const scriptPattern = `${projectName}.${processName}.`;
      const files = readdirSync(zapDir);

      for (const file of files) {
        if (file.startsWith(scriptPattern) && file.endsWith(".sh")) {
          const scriptPath = path.join(zapDir, file);

          try {
            unlinkSync(scriptPath);
            renderer.log.debug(`Cleaned up wrapper script: ${scriptPath}`);
          } catch (e) {
            renderer.log.warn(
              `Failed to delete wrapper script ${scriptPath}: ${e}`,
            );
          }
        }
      }
    } catch (error) {
      renderer.log.warn(`Failed to clean up wrapper scripts: ${error}`);
    }
  }

  static async showLogs(
    name: string,
    projectName?: string,
    follow: boolean = false,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<void> {
    const prefixedName = projectName
      ? buildServiceName(projectName, name, instanceId)
      : name;

    const processInfo = await this.getProcessInfo(prefixedName);

    if (!processInfo) {
      const lastRunLogFile = projectName
        ? this.managedLogFilePath(projectName, name, configDir, instanceId)
        : null;

      if (lastRunLogFile && existsSync(lastRunLogFile)) {
        const { mtime } = statSync(lastRunLogFile);
        renderer.log.warn(
          `${name} is not currently running. Showing logs for the last run from ${this.formatLogTimestamp(mtime)}.`,
        );

        await this.showLogsFromFile(lastRunLogFile, false);
        return;
      }

      if (projectName) {
        renderer.log.warn(
          `No log file found for ${name}. The service may never have started.`,
        );

        return;
      }

      throw new Error(`Process not running: ${name} (${prefixedName})`);
    }

    renderer.log.debug(
      `Showing logs for ${prefixedName}${follow ? " (following)" : ""}`,
    );

    if (projectName) {
      await this.showLogsFromFile(
        this.managedLogFilePath(projectName, name, configDir, instanceId),
        follow,
      );

      return;
    }

    throw new Error(`Process log path unavailable: ${prefixedName}`);
  }

  static async getProcessInfo(name: string): Promise<ProcessInfo | null> {
    try {
      const processes = await this.listProcesses();

      const process = processes.find((p) => p.name === name);

      return process || null;
    } catch {
      return null;
    }
  }

  static async listProcesses(): Promise<ProcessInfo[]> {
    try {
      const rawList = (await this.pm2Action("list")) as Pm2ApiProcess[];
      const processes = rawList.map((proc) => this.toProcessInfo(proc));

      return processes;
    } catch {
      return [];
    }
  }

  /**
   * Managed combined log file for a service, namespaced by stack ID so that
   * stacks sharing a local copy (isolated profiles) never collide.
   */
  private static managedLogFilePath(
    projectName: string,
    serviceName: string,
    configDir?: string,
    instanceId?: string | null,
  ): string {
    const logsDir = path.join(configDir || ".", ".zap", "logs");

    const baseName = instanceId
      ? `${projectName}.${instanceId}.${serviceName}`
      : `${projectName}.${serviceName}`;

    return path.join(logsDir, `${baseName}.log`);
  }

  private static formatLogTimestamp(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");

    return (
      [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
        "-",
      ) +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }

  private static async showLogsFromFile(
    logFile: string,
    follow: boolean,
  ): Promise<void> {
    try {
      const { spawn } = await import("child_process");
      const { existsSync } = await import("fs");

      if (!existsSync(logFile)) {
        renderer.log.warn(`No log file found for this process`);
        return;
      }

      if (follow) {
        const tail = resolveTailRuntime(["-n", "50", "-f", logFile]);

        const child = spawn(tail.command, tail.argsPrefix, {
          stdio: ["ignore", "pipe", "inherit"],
        });

        let buffer = "";
        child.stdout.on("data", (data) => {
          buffer += data.toString();
          const parts = buffer.split(/\r?\n/);
          buffer = parts.pop() || "";

          for (const line of parts) {
            if (line) globalThis.process?.stdout?.write(line + "\n");
          }
        });

        child.on("error", (err) => {
          renderer.log.warn(`tail error for ${logFile}: ${err}`);
        });

        await new Promise<void>((resolve) => {
          const cleanup = () => {
            try {
              child.kill("SIGINT");
            } catch (e) {
              void e;
            }

            resolve();
          };

          child.on("close", cleanup);
          globalThis.process?.on("SIGINT", cleanup);
        });
      } else {
        const tail = resolveTailRuntime(["-50", logFile]);
        const result = await this.runCommand(tail.command, tail.argsPrefix);
        globalThis.process?.stdout?.write(result);
      }
    } catch (error) {
      renderer.log.warn(`Error showing logs from file: ${error}`);
    }
  }

  private static async runCommand(
    command: string,
    args: string[],
  ): Promise<string> {
    const { spawn } = await import("child_process");

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: "pipe" });

      let output = "";
      child.stdout.on("data", (data: { toString(): string }) => {
        output += data.toString();
      });

      child.stderr.on("data", (data: { toString(): string }) => {
        output += data.toString();
      });

      child.on("close", (code: number) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Command failed with code ${code}`));
      });

      child.on("error", reject);
    });
  }

  /**
   * Restart the PM2 daemon and sweep wrapper processes that survived.
   */
  static async recoverPm2Daemon(): Promise<void> {
    const hadProcesses = (await this.listProcesses()).length > 0;

    await this.pm2Action("killDaemon", undefined, 1);
    await new Promise((r) => setTimeout(r, 500));

    await this.killWrapperSurvivors();

    if (hadProcesses) {
      await this.deregisterMissingScriptApps();
    }
  }

  /**
   * After a daemon kill nothing should still be running a .zap wrapper; any
   * survivor is an orphan that will hold its port and break the next start
   * of its service. SIGTERM the trees, then SIGKILL whatever ignored it.
   */
  private static async killWrapperSurvivors(): Promise<void> {
    const survivors = OrphanScanner.listWrapperProcesses();
    if (survivors.length === 0) return;

    for (const survivor of survivors) {
      renderer.log.warn(
        `Killing process tree that survived the PM2 daemon restart (PID ${survivor.pid}, ${survivor.scriptPath})`,
      );

      this.killProcessTree(survivor.pid);
    }

    await new Promise((r) => setTimeout(r, 1000));

    for (const survivor of OrphanScanner.listWrapperProcesses()) {
      try {
        globalThis.process.kill(-survivor.pid, "SIGKILL");
      } catch (e) {
        void e;
      }

      try {
        globalThis.process.kill(survivor.pid, "SIGKILL");
      } catch (e) {
        void e;
      }
    }

    await new Promise((r) => setTimeout(r, 200));
    const remaining = OrphanScanner.listWrapperProcesses();

    if (remaining.length > 0) {
      renderer.log.warn(
        `Processes survived the PM2 daemon restart and could not be terminated (PIDs ${remaining
          .map((p) => p.pid)
          .join(", ")}); they may still hold their ports`,
      );
    }
  }

  private static shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private static buildMiseToolArgs(processConfig: Process): string[] {
    const runtime = processConfig.runtime;
    if (!runtime) return [];

    const tools: Record<string, string> = {
      ...(runtime.node ? { node: runtime.node } : {}),
      ...(runtime.pnpm ? { pnpm: runtime.pnpm } : {}),
      ...(runtime.python ? { python: runtime.python } : {}),
      ...(runtime.ruby ? { ruby: runtime.ruby } : {}),
      ...(runtime.go ? { go: runtime.go } : {}),
      ...(runtime.terraform ? { terraform: runtime.terraform } : {}),
      ...(runtime.tools || {}),
    };

    return Object.entries(tools).map(([name, version]) => `${name}@${version}`);
  }

  private static renderProcessCommand(processConfig: Process): string {
    const provider = processConfig.runtime?.provider || "ambient";

    if (provider === "none" || provider === "ambient" || provider === "shell") {
      return `${processConfig.cmd}\n`;
    }

    if (provider === "mise") {
      const toolArgs = this.buildMiseToolArgs(processConfig)
        .map((arg) => this.shellQuote(arg))
        .join(" ");

      const tools = toolArgs.length > 0 ? `${toolArgs} ` : "";
      const command = this.shellQuote(processConfig.cmd);

      return `exec mise exec ${tools}-- bash -lc ${command}\n`;
    }

    return `${processConfig.cmd}\n`;
  }

  /**
   * For `runtime.provider: shell`, captures the user's login-shell environment
   * so wrapper scripts carry it instead of the env `zap` happened to inherit.
   * Any failure (unsupported platform, missing shell, capture error) falls
   * back to ambient behavior with a warning — it never fails the stack.
   */
  private static async resolveShellCapture(
    processConfig: Process,
  ): Promise<ShellCapture | undefined> {
    if (processConfig.runtime?.provider !== "shell") return undefined;

    const name = processConfig.name as string;

    if (process.platform === "win32") {
      renderer.log.warn(
        `runtime.provider "shell" is not supported on native Windows; using ambient environment for ${name}`,
      );

      return undefined;
    }

    const shell = processConfig.runtime?.shell || process.env.SHELL;

    if (!shell) {
      renderer.log.warn(
        `runtime.provider "shell": no shell configured and $SHELL is unset; using ambient environment for ${name}`,
      );

      return undefined;
    }

    const result = await captureShellEnv(shell);

    if (!result.ok) {
      renderer.log.warn(
        `runtime.provider "shell": capturing environment from ${shell} failed (${result.error}); using ambient environment for ${name}`,
      );

      return undefined;
    }

    return { shell, env: result.env };
  }

  // Vars whose login-shell values describe the capture session, not the
  // toolchain; baking them would mislead the wrapped process.
  private static readonly SHELL_CAPTURE_SKIP_VARS = new Set([
    "PWD",
    "OLDPWD",
    "SHLVL",
    "_",
  ]);

  private static renderShellCaptureExports(
    capture: ShellCapture,
    processConfig: Process,
  ): string {
    const resolvedKeys = new Set(Object.keys(processConfig.resolvedEnv || {}));

    let content = `# Environment captured from login shell: ${capture.shell}\n`;

    for (const [key, value] of Object.entries(capture.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (this.SHELL_CAPTURE_SKIP_VARS.has(key)) continue;
      // Process-specific env (ports, zap.yaml env) must win over the capture
      if (resolvedKeys.has(key)) continue;

      content += `export ${key}=${this.shellQuote(value)}\n`;
    }

    return content;
  }

  private static createWrapperScript(
    projectName: string,
    processConfig: Process,
    configDir: string,

    _instanceId?: string | null,
    shellCapture?: ShellCapture,
  ): string {
    const zapDir = path.join(configDir, ".zap");
    const timestamp = Date.now();
    const fileName = `${projectName}.${processConfig.name as string}.${timestamp}.sh`;
    const filePath = path.join(zapDir, fileName);

    let content = "#!/usr/bin/env bash\n";

    if (shellCapture) {
      content += this.renderShellCaptureExports(shellCapture, processConfig);
    } else if (process.env.PATH) {
      // Export PATH from the shell that ran `zap up` to ensure consistent tool versions
      content += `export PATH="${process.env.PATH}"\n`;
    }

    // Redirect stderr through a colorizer so it appears red in combined logs
    content += `exec 2> >(while IFS= read -r line; do printf '\\033[31m%s\\033[0m\\n' "$line"; done)\n`;

    if (processConfig.source) {
      content += `source ${processConfig.source}\n`;
    }

    content += this.renderProcessCommand(processConfig);

    writeFileSync(filePath, content, { mode: 0o755 });
    return filePath;
  }
}
