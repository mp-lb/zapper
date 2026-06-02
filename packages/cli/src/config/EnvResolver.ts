import { readFileSync, existsSync } from "fs";
import path from "path";
import { parse } from "yaml";
import { parse as dotenvParse } from "dotenv";
import { expand } from "dotenv-expand";
import {
  ZapperConfig,
  Process as ConfigProcess,
  Task as ConfigTask,
  Container as ConfigContainer,
} from "../config/schemas";
import { Context, Process, Task, Container } from "../types/Context";
import { renderer } from "../ui/renderer";
import { loadPorts, loadPortsForInstance } from "./portsManager";

interface RawEnvFile {
  envs?: Array<Record<string, string>>;
}

interface WhitelistFile {
  vars?: unknown;
}

export class EnvResolver {
  static resolve(config: ZapperConfig, projectRoot?: string): ZapperConfig {
    const resolvedConfig = { ...config };

    // Load ports from .zap/state.json if projectRoot is provided
    const assignedPorts = projectRoot ? loadPorts(projectRoot) : {};

    const defaultEnvFiles = resolvedConfig.env ?? resolvedConfig.env_files;

    const hasGlobalEnvSource =
      Array.isArray(defaultEnvFiles) && defaultEnvFiles.length > 0;

    const mergedEnvFromFiles = this.loadAndMergeEnvFiles(
      defaultEnvFiles,
      assignedPorts,
    );

    if (resolvedConfig.native) {
      for (const [name, proc] of Object.entries(resolvedConfig.native)) {
        if (!proc.name) proc.name = name;
        this.resolveConfigProcessEnv(
          proc,
          mergedEnvFromFiles,
          assignedPorts,
          hasGlobalEnvSource,
        );
      }
    }

    if (resolvedConfig.processes) {
      for (const proc of resolvedConfig.processes) {
        this.resolveConfigProcessEnv(
          proc,
          mergedEnvFromFiles,
          assignedPorts,
          hasGlobalEnvSource,
        );
      }
    }

    const dockerServices = resolvedConfig.docker || resolvedConfig.containers;

    if (dockerServices) {
      for (const [name, container] of Object.entries(dockerServices)) {
        if (!container.name) container.name = name;
        this.resolveConfigContainerEnv(
          container,
          mergedEnvFromFiles,
          assignedPorts,
          hasGlobalEnvSource,
        );
      }
    }

    if (resolvedConfig.tasks) {
      for (const [name, task] of Object.entries(resolvedConfig.tasks)) {
        if (!task.name) task.name = name;
        this.resolveConfigTaskEnv(
          task,
          mergedEnvFromFiles,
          assignedPorts,
          hasGlobalEnvSource,
        );
      }
    }

    return resolvedConfig;
  }

  static resolveContext(context: Context): Context {
    const resolvedContext = { ...context };

    // Load ports from .zap/state.json - these have highest precedence
    const assignedPorts =
      context.instance?.ports ||
      loadPortsForInstance(context.projectRoot, context.instanceKey);

    const mergedEnvFromFiles = this.loadAndMergeEnvFiles(
      resolvedContext.envFiles,
      assignedPorts,
    );

    const hasGlobalEnvSource =
      Array.isArray(resolvedContext.envFiles) &&
      resolvedContext.envFiles.length > 0;

    const interpolationEnv = {
      ...process.env,
      ...mergedEnvFromFiles,
    } as Record<string, string>;

    this.interpolateContextStrings(resolvedContext, interpolationEnv);

    for (const proc of resolvedContext.processes) {
      this.resolveProcessEnv(
        proc,
        mergedEnvFromFiles,
        context.projectRoot,
        assignedPorts,
        hasGlobalEnvSource,
      );
    }

    for (const container of resolvedContext.containers) {
      this.resolveContainerEnv(
        container,
        mergedEnvFromFiles,
        context.projectRoot,
        assignedPorts,
        hasGlobalEnvSource,
      );
    }

    for (const task of resolvedContext.tasks) {
      this.resolveTaskEnv(
        task,
        mergedEnvFromFiles,
        context.projectRoot,
        assignedPorts,
        hasGlobalEnvSource,
      );
    }

    if (resolvedContext.homepage) {
      resolvedContext.homepage = this.expandString(
        resolvedContext.homepage,
        mergedEnvFromFiles,
      );
    }

    if (resolvedContext.notes) {
      resolvedContext.notes = this.expandString(
        resolvedContext.notes,
        mergedEnvFromFiles,
      );
    }

    for (const link of resolvedContext.links) {
      link.url = this.expandString(link.url, mergedEnvFromFiles);
    }

    return resolvedContext;
  }

  private static interpolateContextStrings(
    context: Context,
    env: Record<string, string>,
  ): void {
    for (const proc of context.processes) {
      this.interpolateObjectStrings(proc, env, new Set(["env", "resolvedEnv"]));
    }

    for (const container of context.containers) {
      this.interpolateObjectStrings(
        container,
        env,
        new Set(["env", "resolvedEnv"]),
      );
    }

    for (const task of context.tasks) {
      this.interpolateObjectStrings(task, env, new Set(["env", "resolvedEnv"]));
    }

    context.homepage = context.homepage
      ? this.expandConfigString(context.homepage, env)
      : context.homepage;

    context.notes = context.notes
      ? this.expandConfigString(context.notes, env)
      : context.notes;

    for (const link of context.links) {
      link.url = this.expandConfigString(link.url, env);
    }
  }

  private static interpolateObjectStrings(
    value: unknown,
    env: Record<string, string>,
    skipKeys: Set<string>,
  ): unknown {
    if (typeof value === "string") return this.expandConfigString(value, env);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        value[i] = this.interpolateObjectStrings(value[i], env, skipKeys);
      }

      return value;
    }

    if (!value || typeof value !== "object") return value;

    for (const [key, child] of Object.entries(value)) {
      if (skipKeys.has(key)) continue;
      (value as Record<string, unknown>)[key] = this.interpolateObjectStrings(
        child,
        env,
        skipKeys,
      );
    }

    return value;
  }

  private static expandConfigString(
    value: string,
    env: Record<string, string>,
  ): string {
    const sentinel = "\0ZAPPER_DOLLAR\0";
    return value
      .replace(/\$\$/g, sentinel)
      .replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|\?)([^}]*))?\}/g,
        (_match, name: string, operator?: string, operand?: string) => {
          const envValue = env[name];
          const hasValue = envValue !== undefined && envValue !== "";
          if (operator === ":-") return hasValue ? envValue : operand || "";

          if (operator === "?") {
            if (hasValue) return envValue;
            throw new Error(
              operand || `Missing required config variable ${name}`,
            );
          }

          return envValue ?? "";
        },
      )
      .replace(new RegExp(sentinel, "g"), "$");
  }

  private static expandString(
    value: string,
    env: Record<string, string>,
  ): string {
    const result = expand({
      parsed: { ...env, __value__: value },
      processEnv: {},
    });

    return result.parsed?.__value__ ?? value;
  }

  private static resolveConfigProcessEnv(
    proc: ConfigProcess,
    mergedEnvFromFiles: Record<string, string>,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    proc.resolvedEnv = this.resolveServiceEnv(
      proc.env,
      mergedEnvFromFiles,
      undefined,
      assignedPorts,
      hasGlobalEnvSource,
    );
  }

  private static resolveConfigContainerEnv(
    container: ConfigContainer,
    mergedEnvFromFiles: Record<string, string>,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    container.resolvedEnv = this.resolveServiceEnv(
      container.env,
      mergedEnvFromFiles,
      undefined,
      assignedPorts,
      hasGlobalEnvSource,
    );

    container.ports = this.expandPorts(container.ports, mergedEnvFromFiles);

    renderer.log.debug(`Final resolved env for docker ${container.name}:`, {
      data: container.resolvedEnv,
    });
  }

  private static resolveConfigTaskEnv(
    task: ConfigTask,
    mergedEnvFromFiles: Record<string, string>,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    task.resolvedEnv = this.resolveServiceEnv(
      task.env,
      mergedEnvFromFiles,
      undefined,
      assignedPorts,
      hasGlobalEnvSource,
    );

    renderer.log.debug(`Final resolved env for task ${task.name}:`, {
      data: task.resolvedEnv,
    });
  }

  private static resolveProcessEnv(
    proc: Process,
    mergedEnvFromFiles: Record<string, string>,
    projectRoot: string,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    proc.resolvedEnv = this.resolveServiceEnv(
      proc.env,
      mergedEnvFromFiles,
      projectRoot,
      assignedPorts,
      hasGlobalEnvSource,
    );
  }

  private static resolveContainerEnv(
    container: Container,
    mergedEnvFromFiles: Record<string, string>,
    projectRoot: string,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    container.resolvedEnv = this.resolveServiceEnv(
      container.env,
      mergedEnvFromFiles,
      projectRoot,
      assignedPorts,
      hasGlobalEnvSource,
    );

    container.ports = this.expandPorts(container.ports, mergedEnvFromFiles);

    renderer.log.debug(`Final resolved env for docker ${container.name}:`, {
      data: container.resolvedEnv,
    });
  }

  private static resolveTaskEnv(
    task: Task,
    mergedEnvFromFiles: Record<string, string>,
    projectRoot: string,
    assignedPorts: Record<string, string>,
    hasGlobalEnvSource: boolean,
  ): void {
    renderer.log.debug(`Processing task: ${task.name}`);

    task.resolvedEnv = this.resolveServiceEnv(
      task.env,
      mergedEnvFromFiles,
      projectRoot,
      assignedPorts,
      hasGlobalEnvSource,
    );

    renderer.log.debug(`Final resolved env for task ${task.name}:`, {
      data: task.resolvedEnv,
    });
  }

  private static resolveServiceEnv(
    env: string[] | string | undefined,
    globalEnv: Record<string, string>,
    projectRoot?: string,
    assignedPorts: Record<string, string> = {},
    hasGlobalEnvSource = false,
  ): Record<string, string> {
    if (env === undefined) return {};

    if (env === "*") return { ...globalEnv };

    if (Array.isArray(env)) {
      const files = this.resolvePaths(env, projectRoot);
      return this.loadAndMergeEnvFiles(files, assignedPorts);
    }

    if (!hasGlobalEnvSource) {
      throw new Error(
        `Environment whitelist file requires root env or env_files: ${env}`,
      );
    }

    const whitelistPath = this.resolvePath(env, projectRoot);
    const vars = this.loadWhitelistFile(whitelistPath);
    const resolved: Record<string, string> = {};

    for (const key of vars) {
      const value = globalEnv[key];
      if (value !== undefined) resolved[key] = value;
    }

    return resolved;
  }

  private static resolvePaths(paths: string[], projectRoot?: string): string[] {
    return paths.map((p) => this.resolvePath(p, projectRoot));
  }

  private static resolvePath(filePath: string, projectRoot?: string): string {
    if (!projectRoot || path.isAbsolute(filePath)) return filePath;
    return path.join(projectRoot, filePath);
  }

  private static loadWhitelistFile(filePath: string): string[] {
    if (!existsSync(filePath)) {
      throw new Error(`Environment whitelist file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext !== ".yaml" && ext !== ".yml") {
      throw new Error(`Environment whitelist file must be YAML: ${filePath}`);
    }

    const data = parse(readFileSync(filePath, "utf8")) as
      | WhitelistFile
      | undefined;

    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.vars) ||
      Object.keys(data).some((key) => key !== "vars")
    ) {
      throw new Error(
        `Environment whitelist file must contain only a vars array: ${filePath}`,
      );
    }

    const vars = data.vars;

    for (const value of vars) {
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(
          `Environment whitelist vars must be non-empty strings: ${filePath}`,
        );
      }

      if (value === "*") {
        throw new Error(
          `Environment whitelist variable "*" is reserved: ${filePath}`,
        );
      }
    }

    return vars;
  }

  private static loadAndMergeEnvFiles(
    files?: string[],
    ports?: Record<string, string>,
  ): Record<string, string> {
    // Start with ports - they have highest precedence
    const merged: Record<string, string> = { ...ports };

    if (!Array.isArray(files) || files.length === 0) {
      renderer.log.debug("No env files to load:", { data: files });
      return merged;
    }

    renderer.log.debug("Loading env files:", { data: files });

    for (const file of files) {
      if (!existsSync(file)) {
        renderer.log.debug(`Env file does not exist: ${file}`);
        continue;
      }

      const ext = path.extname(file).toLowerCase();

      try {
        const content = readFileSync(file, "utf8");

        // Check if it's a YAML file with special envs array structure
        if (ext === ".yaml" || ext === ".yml") {
          const data = parse(content) as RawEnvFile | undefined;
          const envs = Array.isArray(data?.envs) ? data?.envs : [];
          for (const kv of envs) Object.assign(merged, kv);
        } else {
          // Default: treat all other files as dotenv format (KEY=value pairs with expansion)
          const parsed = dotenvParse(content);
          renderer.log.debug(`Parsed env file ${file}:`, { data: parsed });

          const hasPorts = ports && Object.keys(ports).length > 0;

          // Ports need to be "virtually" present both FIRST and LAST:
          // - FIRST: so ${PORT_A} references in env files can resolve during expansion
          // - LAST: so assigned ports override any PORT_A values defined in env files
          //
          // To achieve this, we remove overlapping keys from parsed (ports win),
          // then combine with ports first so they're available for ${} interpolation.
          if (hasPorts) {
            // Remove keys from parsed that overlap with ports - ports always win
            const parsedWithoutPorts = { ...parsed };

            for (const key of Object.keys(ports)) {
              delete parsedWithoutPorts[key];
            }

            // Combine with ports first for proper expansion order
            const combined = { ...ports, ...parsedWithoutPorts };
            const expanded = expand({ parsed: combined, processEnv: {} });
            Object.assign(merged, expanded.parsed);
          } else {
            const combined = { ...merged, ...parsed };
            const expanded = expand({ parsed: combined, processEnv: {} });
            Object.assign(merged, expanded.parsed);
          }
        }
      } catch (e) {
        renderer.log.debug(`Failed to read env file ${file}: ${e}`);
      }
    }

    return merged;
  }

  private static expandPorts(
    ports: string[] | undefined,
    env: Record<string, string>,
  ): string[] | undefined {
    if (!Array.isArray(ports)) return ports;
    return ports.map((port) => this.expandString(port, env));
  }

  static getProcessEnv(
    processName: string,
    resolvedConfig: ZapperConfig,
  ): Record<string, string> {
    const proc = resolvedConfig.native?.[processName];
    if (!proc) throw new Error(`Process ${processName} not found`);
    return (proc.resolvedEnv as Record<string, string>) || {};
  }

  static getProcessEnvFromContext(
    processName: string,
    context: Context,
  ): Record<string, string> {
    const proc = context.processes.find((p) => p.name === processName);
    if (!proc) throw new Error(`Process ${processName} not found`);
    return proc.resolvedEnv || {};
  }
}
