import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { ContainerStartError } from "../../errors";
import { runDocker } from "./runDocker";
import { ensureDockerAvailable } from "./ensureDocker";

interface DockerConfig {
  image: string;
  ports?: string[];
  volumes?: string[];
  networks?: string[];
  environment?: Record<string, string>;
  command?: string;
  labels?: Record<string, string>;
}

export interface DockerContainer {
  id: string;
  name: string;
  status: string;
  ports: string[];
  networks: string[];
  created: string;
  startedAt?: string;
}

interface DockerLogContext {
  projectName: string;
  serviceName: string;
  configDir?: string;
}

export class DockerManager {
  private static readonly ansiEscape = String.fromCharCode(27);

  private static getStartupLogPath({
    projectName,
    serviceName,
    configDir,
  }: DockerLogContext): string {
    return path.join(
      configDir || ".",
      ".zap",
      "logs",
      `${projectName}.${serviceName}.startup.log`,
    );
  }

  private static ensureLogsDir(configDir?: string): void {
    mkdirSync(path.join(configDir || ".", ".zap", "logs"), { recursive: true });
  }

  private static stripAnsi(text: string): string {
    return text.replace(new RegExp(`${this.ansiEscape}\\[[0-9;]*m`, "g"), "");
  }

  private static summarizeStartupFailure(output: string): string {
    const lines = this.stripAnsi(output)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const lastLine = lines.at(-1);
    if (!lastLine) {
      return "Docker did not provide any error output.";
    }

    return lastLine
      .replace(/^docker:\s*/i, "")
      .replace(/^Error response from daemon:\s*/i, "");
  }

  private static persistStartupLog(
    context: DockerLogContext,
    dockerName: string,
    stdout: string,
    stderr: string,
  ): string {
    this.ensureLogsDir(context.configDir);
    const logPath = this.getStartupLogPath(context);
    const contents = [
      `Startup log for service "${context.serviceName}" (${dockerName})`,
      "",
      "[source]",
      "docker run",
      "",
      "[stdout]",
      stdout.trim() || "(empty)",
      "",
      "[stderr]",
      stderr.trim() || "(empty)",
      "",
    ].join("\n");
    writeFileSync(logPath, contents);
    return logPath;
  }

  private static clearStartupLog(context?: DockerLogContext): void {
    if (!context) return;

    const logPath = this.getStartupLogPath(context);
    if (existsSync(logPath)) {
      rmSync(logPath, { force: true });
    }
  }

  private static buildRunArgs(name: string, config: DockerConfig): string[] {
    const args = ["run", "-d", "--name", name];
    if (config.labels)
      for (const [k, v] of Object.entries(config.labels))
        args.push("--label", `${k}=${v}`);
    if (config.ports) for (const p of config.ports) args.push("-p", p);
    if (config.volumes) for (const v of config.volumes) args.push("-v", v);
    if (config.networks)
      for (const n of config.networks) args.push("--network", n);
    if (config.environment)
      for (const [k, v] of Object.entries(config.environment))
        args.push("-e", `${k}=${v}`);
    args.push(config.image);
    if (config.command) args.push(config.command);
    return args;
  }

  static async startContainer(
    name: string,
    config: DockerConfig,
  ): Promise<void> {
    await ensureDockerAvailable();

    try {
      await runDocker(["rm", "-f", name]);
    } catch (e) {
      // ignore if container doesn't exist
    }
    const args = this.buildRunArgs(name, config);
    await runDocker(args);
  }

  static async startContainerAsync(
    name: string,
    config: DockerConfig,
    logContext?: DockerLogContext,
  ): Promise<number> {
    await ensureDockerAvailable();

    try {
      await runDocker(["rm", "-f", name]);
    } catch (e) {
      // ignore if container doesn't exist
    }
    const args = this.buildRunArgs(name, config);
    return new Promise((resolve, reject) => {
      let pid = -1;
      let stdout = "";
      let stderr = "";
      const child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      pid = child.pid || -1;

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.once("error", (err) => {
        const summary = `Failed to run Docker command: ${err.message}`;
        if (!logContext) {
          reject(new Error(summary));
          return;
        }

        this.persistStartupLog(logContext, name, stdout, stderr || summary);
        reject(new ContainerStartError(logContext.serviceName, name, summary));
      });

      child.once("close", (code) => {
        if (code === 0) {
          this.clearStartupLog(logContext);
          resolve(pid);
          return;
        }

        const combinedOutput = `${stderr}\n${stdout}`.trim();
        const summary = this.summarizeStartupFailure(combinedOutput);

        if (!logContext) {
          reject(new Error(`Docker command failed: ${summary}`));
          return;
        }

        this.persistStartupLog(logContext, name, stdout, stderr);
        reject(new ContainerStartError(logContext.serviceName, name, summary));
      });
    });
  }

  static async stopContainer(name: string): Promise<void> {
    // Prefer removing containers entirely to avoid name conflicts on next start
    await runDocker(["rm", "-f", name]);
  }

  static async restartContainer(name: string): Promise<void> {
    await runDocker(["restart", name]);
  }

  static async removeContainer(name: string): Promise<void> {
    await runDocker(["rm", "-f", name]);
  }

  static async getContainerInfo(name: string): Promise<DockerContainer | null> {
    try {
      const result = await runDocker([
        "inspect",
        "--format",
        "{{json .}}",
        name,
      ]);
      const raw = JSON.parse(result) as Record<string, unknown>;
      const state = raw["State"] as Record<string, unknown> | undefined;
      const net = raw["NetworkSettings"] as Record<string, unknown> | undefined;
      const networks =
        (net?.["Networks"] as Record<string, unknown> | undefined) || {};

      return {
        id: (raw["Id"] as string) || "",
        name: ((raw["Name"] as string) || "").replace(/^\//, ""),
        status: (state?.["Status"] as string) || "",
        ports: [],
        networks: Object.keys(networks),
        created: (raw["Created"] as string) || "",
        startedAt: (state?.["StartedAt"] as string) || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  static async listContainers(): Promise<DockerContainer[]> {
    try {
      const result = await runDocker(["ps", "-a", "--format", "{{json .}}"]);
      const lines = result
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const containers = lines.map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      return containers.map((raw) => ({
        id: (raw["ID"] as string) || (raw["Id"] as string) || "",
        name: (raw["Names"] as string) || (raw["Name"] as string) || "",
        status: (raw["Status"] as string) || "",
        ports: raw["Ports"]
          ? Array.isArray(raw["Ports"])
            ? (raw["Ports"] as string[])
            : [String(raw["Ports"])]
          : [],
        networks: raw["Networks"]
          ? Array.isArray(raw["Networks"])
            ? (raw["Networks"] as string[])
            : [String(raw["Networks"])]
          : [],
        created:
          (raw["CreatedAt"] as string) || (raw["Created"] as string) || "",
      }));
    } catch (error) {
      return [];
    }
  }

  static async createNetwork(name: string): Promise<void> {
    await ensureDockerAvailable();

    try {
      await runDocker(["network", "create", name]);
    } catch (error) {
      // ignore if exists
    }
  }

  static async removeNetwork(name: string): Promise<void> {
    try {
      await runDocker(["network", "rm", name]);
    } catch (error) {
      // ignore if missing
    }
  }

  static async createVolume(name: string): Promise<void> {
    await ensureDockerAvailable();

    try {
      await runDocker(["volume", "create", name]);
    } catch (error) {
      // ignore if exists
    }
  }

  static async showLogs(name: string, follow: boolean = false): Promise<void> {
    await ensureDockerAvailable();

    const args = ["logs"];
    if (follow) args.push("-f");
    args.push(name);

    return new Promise((resolve, reject) => {
      const child = spawn("docker", args, { stdio: "inherit" });
      child.on("close", () => resolve());
      child.on("error", (err) => reject(err));
    });
  }

  static startupLogExists(context: DockerLogContext): boolean {
    return existsSync(this.getStartupLogPath(context));
  }

  static async showStartupLog(context: DockerLogContext): Promise<void> {
    const logPath = this.getStartupLogPath(context);

    if (!existsSync(logPath)) {
      return;
    }

    const contents = readFileSync(logPath, "utf8");
    globalThis.process?.stdout?.write(contents);
    if (!contents.endsWith("\n")) {
      globalThis.process?.stdout?.write("\n");
    }
  }

  static async containerExists(name: string): Promise<boolean> {
    const info = await this.getContainerInfo(name);
    return info !== null;
  }
}
