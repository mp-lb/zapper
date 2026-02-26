import { spawn, execSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
} from "fs";
import path from "path";
import { Process } from "../../config/schemas";
import { ProcessInfo } from "../../types/index";
import { renderer } from "../../ui/renderer";
import { buildServiceName, buildPrefix } from "../../utils/nameBuilder";

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
          interpreter: "/bin/bash",
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
          log: path.join(
            logsDir,
            `${projectName}.${processConfig.name as string}.log`,
          ),
          merge_logs: true,
          // Limit restarts for faster feedback in local development
          // Instead of infinite retries, fail fast after 2 attempts
          autorestart: true,
          max_restarts: 2,
          min_uptime: 4000, // Must stay up 4s to count as successful start
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
    await this.killManagedProcessTree(prefixedName);
    await this.runPm2Command(["restart", prefixedName]);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _instanceId?: string | null,
  ): Promise<void> {
    try {
      const { rmSync, unlinkSync, existsSync } = await import("fs");
      const logsDir = path.join(configDir || ".", ".zap", "logs");

      // Remove the combined log file
      const logPath = path.join(logsDir, `${projectName}.${processName}.log`);

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
      } catch (e) {
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
      throw new Error(`PM2 process not running: ${name} (${prefixedName})`);
    }

    renderer.log.debug(
      `Showing logs for ${prefixedName}${follow ? " (following)" : ""}`,
    );

    const logFile = await this.getLogFilePath(
      prefixedName,
      projectName,
      configDir,
      instanceId,
    );

    if (!logFile) {
      throw new Error(`Could not find log file for ${prefixedName}`);
    }

    await this.showLogsFromFile(logFile, follow);
  }

  static async getProcessInfo(name: string): Promise<ProcessInfo | null> {
    try {
      const output = await this.runPm2Command(["jlist", "--silent"]);
      const sanitized = this.sanitizeJsonOutput(output);
      const processes = JSON.parse(sanitized) as ProcessInfo[];

      const process = processes.find((p) => p.name === name);

      return process || null;
    } catch (error) {
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
      }));

      return processes;
    } catch (error) {
      return [];
    }
  }

  private static async getLogFilePath(
    processName: string,
    projectName?: string,
    configDir?: string,
    instanceId?: string | null,
  ): Promise<string | null> {
    try {
      // For Zapper-managed processes, use our custom log path
      if (
        projectName &&
        processName.startsWith(buildPrefix(projectName, instanceId) + ".")
      ) {
        const logsDir = path.join(configDir || ".", ".zap", "logs");
        const baseName = processName.replace(
          buildPrefix(projectName, instanceId) + ".",
          "",
        );
        return path.join(logsDir, `${projectName}.${baseName}.log`);
      }

      // For non-Zapper processes, fall back to PM2's default paths
      const output = await this.runPm2Command(["jlist", "--silent"]);
      const processes = JSON.parse(this.sanitizeJsonOutput(output)) as Array<
        Record<string, unknown>
      >;

      const proc = processes.find((p) => p.name === processName);

      if (!proc) {
        renderer.log.warn(`Process not found: ${processName}`);
        return null;
      }

      const pm2Env = proc.pm2_env as Record<string, unknown>;
      return String(pm2Env.pm_log_path || pm2Env.pm_out_log_path || "");
    } catch (error) {
      renderer.log.warn(`Error getting log file path: ${error}`);
      return null;
    }
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
        const child = spawn("tail", ["-n", "50", "-f", logFile], {
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
        const result = await this.runCommand("tail", ["-50", logFile]);
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

  private static async runPm2CommandFollow(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      renderer.log.debug(`Running: pm2 ${args.join(" ")}`);
      const child = spawn("pm2", args, { stdio: ["pipe", "pipe", "pipe"] });

      child.stdout.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            // Strip PM2 prefix (e.g., "555|zap.le | hello world" -> "hello world")
            const strippedLine = line.replace(/^\d+\|[^|]*\|\s*/, "");
            globalThis.process?.stdout?.write(strippedLine + "\n");
          }
        }
      });

      child.stderr.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            // Strip PM2 prefix from stderr as well
            const strippedLine = line.replace(/^\d+\|[^|]*\|\s*/, "");
            globalThis.process?.stderr?.write(strippedLine + "\n");
          }
        }
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `PM2 command exited with code ${code} (args: ${args.join(" ")})`,
            ),
          );
        }
      });

      // Handle process interruption
      globalThis.process?.on("SIGINT", () => {
        child.kill("SIGINT");
        resolve();
      });
    });
  }

  private static async runPm2CommandStream(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      renderer.log.debug(`Running: pm2 ${args.join(" ")}`);
      const child = spawn("pm2", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            // Strip PM2 prefix (e.g., "555|zap.le | hello world" -> "hello world")
            const strippedLine = line.replace(/^\d+\|[^|]*\|\s*/, "");
            globalThis.process?.stdout?.write(strippedLine + "\n");
          }
        }
      });

      child.stderr.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            // Strip PM2 prefix from stderr as well
            const strippedLine = line.replace(/^\d+\|[^|]*\|\s*/, "");
            globalThis.process?.stderr?.write(strippedLine + "\n");
          }
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `PM2 command failed with code ${code} (args: ${args.join(" ")})`,
            ),
          );
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to run PM2 command: ${err.message}`));
      });
    });
  }

  private static runPm2Command(
    args: string[],
    retryCount = 0,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      renderer.log.debug(`Running: pm2 ${args.join(" ")}`);
      const child = spawn("pm2", args, {
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
              `PM2 state corruption detected, resetting PM2 and retrying...`,
            );

            try {
              // Kill PM2 daemon to reset state
              await this.runPm2Command(["kill"], 1);
              // Wait a bit for PM2 to fully stop
              await new Promise((r) => setTimeout(r, 500));
              // Retry the original command
              const result = await this.runPm2Command(args, 1);
              resolve(result);
              return;
            } catch (resetError) {
              renderer.log.warn(`PM2 reset failed: ${resetError}`);
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

    let content = "#!/bin/bash\n";
    // Export PATH from the shell that ran `zap up` to ensure consistent tool versions
    if (process.env.PATH) {
      content += `export PATH="${process.env.PATH}"\n`;
    }
    // Redirect stderr through a colorizer so it appears red in combined logs
    content += `exec 2> >(while IFS= read -r line; do printf '\\033[31m%s\\033[0m\\n' "$line"; done)\n`;
    if (processConfig.source) {
      content += `source ${processConfig.source}\n`;
    }

    content += `${processConfig.cmd}\n`;

    writeFileSync(filePath, content, { mode: 0o755 });
    return filePath;
  }
}
