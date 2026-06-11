import { spawn, execSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import path from "path";
import { Process } from "../../config/schemas";
import { ProcessInfo } from "../../types/index";
import { renderer } from "../../ui/renderer";
import { buildServiceName } from "../../utils/nameBuilder";
import {
  resolvePm2Runtime,
  resolveBashRuntime,
  resolveTailRuntime,
  RuntimeCommand,
} from "../../runtime";
import { OrphanScanner } from "../../system/OrphanScanner";

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

    // Create a minimal wrapper script for PM2 to execute
    const wrapperScript = this.createWrapperScript(
      projectName,
      processConfig,
      configDir,
      instanceId,
    );

    renderer.log.debug(
      `Creating ecosystem for ${processConfig.name as string} with env whitelist:`,
      { data: processConfig.env },
    );

    renderer.log.debug(`Final env for PM2 ecosystem:`, {
      data: processConfig.resolvedEnv,
    });

    const ecosystem = {
      apps: [
        {
          name: buildServiceName(
            projectName,
            processConfig.name as string,
            instanceId,
          ),
          script: wrapperScript,
          interpreter: resolveBashRuntime([]).command,
          cwd: (() => {
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
          })(),
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
          merge_logs: true,
          // Limit restarts for faster feedback in local development
          // Instead of infinite retries, fail fast after 2 attempts
          autorestart: true,
          max_restarts: 2,
          min_uptime: 4000, // Must stay up 4s to count as successful start
          // PM2 only counts "unstable" restarts within min_uptime*max_restarts
          // of created_at, and created_at is never reset by restarts. An app
          // that starts crashing later in life (e.g. its wrapper script was
          // deleted) therefore bypasses max_restarts entirely and loops
          // unbounded. Exponential backoff (capped at 15s by PM2) throttles
          // any such loop; it resets once the app runs stably again.
          exp_backoff_restart_delay: 100,
        },
      ],
    } as Record<string, unknown>;

    const tempFile = path.join(
      zapDir,
      `${projectName}.${processConfig.name as string}.${Date.now()}.ecosystem.json`,
    );

    const ecosystemJson = JSON.stringify(ecosystem, null, 2);
    renderer.log.debug(`Ecosystem JSON for ${processConfig.name as string}:`);
    renderer.log.debug("─".repeat(50));
    renderer.log.debug(ecosystemJson);
    renderer.log.debug("─".repeat(50));

    writeFileSync(tempFile, ecosystemJson);

    try {
      await this.runPm2Command(["start", tempFile]);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {
        void e;
      }
    }
  }

  static async startProcessFromEcosystem(ecosystemPath: string): Promise<void> {
    const args = ["start", ecosystemPath];
    await this.runPm2Command(args);
  }

  /**
   * Kill an entire process tree rooted at the given PID.
   * Uses `kill -TERM -<pgid>` to signal the process group first,
   * then falls back to killing individual child PIDs via `pgrep -P`.
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

      // Also explicitly find and kill all descendant processes
      try {
        const childPids = execSync(`pgrep -P ${pid}`, { encoding: "utf-8" })
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(Number);

        for (const childPid of childPids) {
          this.killProcessTree(childPid);
        }
      } catch {
        // pgrep returns non-zero when no children found – that's fine
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
   * manages (e.g. survivors of a PM2 daemon crash found by the system audit).
   */
  static killDetachedProcessTree(pid: number): void {
    this.killProcessTree(pid);
  }

  /**
   * Get the PID of a PM2-managed process and kill its entire tree
   * before removing it from PM2.
   */
  private static async killManagedProcessTree(
    prefixedName: string,
  ): Promise<void> {
    try {
      const info = await this.getProcessInfo(prefixedName);

      if (info?.pid && info.pid > 0) {
        renderer.log.debug(
          `Killing process tree for ${prefixedName} (PID ${info.pid})`,
        );

        this.killProcessTree(info.pid);
        // Give processes a moment to exit cleanly
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (error) {
      renderer.log.debug(
        `Could not kill process tree for ${prefixedName}: ${error}`,
      );
    }
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

    await this.killManagedProcessTree(prefixedName);
    await this.runPm2Command(["stop", prefixedName]);

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
      await this.killManagedProcessTree(prefixedName);
      await this.runPm2Command(["delete", prefixedName]);

      throw new Error(
        `Cannot restart ${prefixedName}: its wrapper script no longer exists (${info.script}). ` +
          `The registration was removed from PM2 to prevent a crash loop; start the service again to recreate it.`,
      );
    }

    await this.killManagedProcessTree(prefixedName);
    await this.runPm2Command(["restart", prefixedName]);
  }

  /**
   * A registration whose .zap wrapper script is gone can only crash-loop
   * (bash exits 127 instantly, PM2 restarts it forever — its max_restarts cap
   * does not apply to apps that start failing later in life). Such an app
   * must be deregistered, never started or restarted.
   */
  static hasMissingWrapperScript(info: Pick<ProcessInfo, "script">): boolean {
    return Boolean(
      info.script &&
      /\/\.zap\/[^/]+\.sh$/.test(info.script) &&
      !existsSync(info.script),
    );
  }

  /**
   * Deregister every PM2 app whose Zapper wrapper script no longer exists on
   * disk. Returns the names that were removed.
   */
  static async deregisterMissingScriptApps(): Promise<string[]> {
    const processes = await this.listProcesses();
    const removed: string[] = [];

    for (const proc of processes) {
      if (!this.hasMissingWrapperScript(proc)) continue;

      renderer.log.warn(
        `Deregistering ${proc.name}: wrapper script no longer exists (${proc.script})`,
      );

      await this.killManagedProcessTree(proc.name);

      try {
        await this.runPm2Command(["delete", proc.name], 1);
        removed.push(proc.name);
      } catch (error) {
        renderer.log.warn(`Failed to deregister ${proc.name}: ${error}`);
      }
    }

    return removed;
  }

  /**
   * Stop and deregister every PM2 app whose wrapper script lives under the
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

      await this.killManagedProcessTree(proc.name);

      try {
        await this.runPm2Command(["delete", proc.name]);
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

    await this.killManagedProcessTree(prefixedName);
    await this.runPm2Command(["delete", prefixedName]);

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
        await this.killManagedProcessTree(proc.name);
        await this.runPm2Command(["delete", proc.name]);
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

  private static sanitizeJsonOutput(output: string): string {
    // PM2 occasionally prepends warnings to stdout; strip until first JSON token
    const firstArray = output.indexOf("[");
    const firstObject = output.indexOf("{");
    let idx = -1;
    if (firstArray !== -1 && firstObject !== -1)
      idx = Math.min(firstArray, firstObject);
    else idx = Math.max(firstArray, firstObject);
    return idx > 0 ? output.slice(idx) : output;
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

      throw new Error(`PM2 process not running: ${name} (${prefixedName})`);
    }

    renderer.log.debug(
      `Showing logs for ${prefixedName}${follow ? " (following)" : ""}`,
    );

    await this.showLogsWithPm2(prefixedName, follow);
  }

  static async getProcessInfo(name: string): Promise<ProcessInfo | null> {
    try {
      const output = await this.runPm2Command(["jlist", "--silent"]);
      const sanitized = this.sanitizeJsonOutput(output);
      const processes = JSON.parse(sanitized) as ProcessInfo[];

      const process = processes.find((p) => p.name === name);

      return process || null;
    } catch {
      return null;
    }
  }

  static async listProcesses(): Promise<ProcessInfo[]> {
    try {
      const output = await this.runPm2Command(["jlist", "--silent"]);

      const rawList = JSON.parse(this.sanitizeJsonOutput(output)) as Array<
        Record<string, unknown>
      >;

      const processes: ProcessInfo[] = rawList.map((proc) => ({
        name: String(proc["name"]),
        pid: Number(proc["pid"]),
        status: String((proc["pm2_env"] as Record<string, unknown>)["status"]),
        uptime:
          Date.now() -
          Number((proc["pm2_env"] as Record<string, unknown>)["pm_uptime"]),
        memory: Number((proc["monit"] as Record<string, unknown>)["memory"]),
        cpu: Number((proc["monit"] as Record<string, unknown>)["cpu"]),
        restarts: Number(
          (proc["pm2_env"] as Record<string, unknown>)["restart_time"],
        ),
        cwd: String(
          (proc["pm2_env"] as Record<string, unknown>)["pm_cwd"] || "",
        ),
        script: String(
          (proc["pm2_env"] as Record<string, unknown>)["pm_exec_path"] || "",
        ),
      }));

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

  private static async showLogsWithPm2(
    processName: string,
    follow: boolean,
  ): Promise<void> {
    const args = ["logs", processName, "--lines", "50"];
    if (!follow) args.push("--nostream");

    return new Promise((resolve, reject) => {
      const pm2 = this.resolvePm2Command(args);
      renderer.log.debug(`Running: ${pm2.label}`);

      const child = spawn(pm2.command, pm2.argsPrefix, {
        stdio: "inherit",
      });

      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PM2 logs failed with code ${code}`));
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to run PM2 logs: ${err.message}`));
      });
    });
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

  private static runPm2Command(
    args: string[],
    retryCount = 0,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const pm2 = this.resolvePm2Command(args);
      renderer.log.debug(`Running: ${pm2.label}`);

      const child = spawn(pm2.command, pm2.argsPrefix, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let error = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        error += data.toString();
      });

      child.on("close", async (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          // Check if this is a PM2 state corruption issue
          const isStateCorruption =
            error.includes("Process") &&
            error.includes("not found") &&
            error.includes("Cannot read properties of undefined");

          const isVersionMismatch =
            output.includes("In-memory PM2 is out-of-date") ||
            error.includes("In-memory PM2 is out-of-date");

          // Only retry once on state corruption or version mismatch
          if ((isStateCorruption || isVersionMismatch) && retryCount === 0) {
            renderer.log.warn(
              isVersionMismatch
                ? `PM2 daemon/CLI version mismatch detected, restarting the PM2 daemon...`
                : `PM2 state corruption detected, restarting the PM2 daemon...`,
            );

            try {
              await this.recoverPm2Daemon();
              // Retry the original command
              const result = await this.runPm2Command(args, 1);
              resolve(result);
              return;
            } catch (resetError) {
              renderer.log.warn(`PM2 recovery failed: ${resetError}`);
              // Fall through to original error
            }
          }

          reject(
            new Error(
              `PM2 command failed (args: ${args.join(" ")}, code: ${code})\nstdout: ${output}\nstderr: ${error}`,
            ),
          );
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to run PM2 command: ${err.message}`));
      });
    });
  }

  /**
   * Restart the PM2 daemon without losing anyone's processes.
   *
   * A bare `pm2 kill` takes down every project's apps at once, so a daemon
   * restart must restore what was running: snapshot the process table first,
   * kill the daemon, terminate any process trees that survived the kill
   * (they would otherwise linger as orphans holding their ports, blocking
   * every later start of that service), resurrect the snapshot, and drop any
   * registration whose wrapper script is gone so a stale app cannot come
   * back crash-looping.
   */
  private static async recoverPm2Daemon(): Promise<void> {
    let saved = false;

    try {
      // --force writes the dump even when the table is empty; without it a
      // failed save would leave an ancient dump that resurrect would replay.
      await this.runPm2Command(["save", "--force"], 1);
      saved = true;
    } catch (error) {
      renderer.log.warn(
        `Could not snapshot the PM2 process table; processes will not be auto-restored after the daemon restart: ${error}`,
      );
    }

    await this.runPm2Command(["kill"], 1);
    await new Promise((r) => setTimeout(r, 500));

    await this.killWrapperSurvivors();

    if (saved) {
      try {
        await this.runPm2Command(["resurrect"], 1);
      } catch (error) {
        renderer.log.warn(
          `PM2 resurrect failed after daemon restart: ${error}`,
        );
      }

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
        `Killing process tree that survived the PM2 daemon kill (PID ${survivor.pid}, ${survivor.scriptPath})`,
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
        `Processes survived the PM2 daemon kill and could not be terminated (PIDs ${remaining
          .map((p) => p.pid)
          .join(", ")}); they may still hold their ports`,
      );
    }
  }

  private static resolvePm2Command(args: string[]): RuntimeCommand {
    return resolvePm2Runtime(args);
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

  private static createWrapperScript(
    projectName: string,
    processConfig: Process,
    configDir: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _instanceId?: string | null,
  ): string {
    const zapDir = path.join(configDir, ".zap");
    const timestamp = Date.now();
    const fileName = `${projectName}.${processConfig.name as string}.${timestamp}.sh`;
    const filePath = path.join(zapDir, fileName);

    let content = "#!/usr/bin/env bash\n";

    // Export PATH from the shell that ran `zap up` to ensure consistent tool versions
    if (process.env.PATH) {
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
