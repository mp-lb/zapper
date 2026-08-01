import { parseYamlFile } from "../config/yamlParser";
import { EnvResolver } from "../config/EnvResolver";
import { NativeProcessExecutor } from "./process/NativeProcessExecutor";
import { NativeProcessManager } from "./process/NativeProcessManager";
import { DockerManager } from "./docker";
import { ZapperConfig } from "../config/schemas";
import { Context, Process, Container } from "../types/Context";
import type { ServiceActionReport, ServiceActionReporter } from "../types";
import { emptyServiceActionReport } from "../utils/serviceActionReport";
import { createContext } from "./createContext";
import path from "path";
import { renderer } from "../ui/renderer";
import * as fs from "fs";
import { resolveConfigPath } from "../utils/findUp";
import { Planner } from "./Planner";
import { executeActions } from "./executeActions";
import { confirm } from "../utils/confirm";
import { GitManager, cloneRepos as cloneRepositories } from "./git";
import {
  buildServiceAliasMap,
  getNativeTargets,
  resolveAliasesToCanonical,
} from "../utils";
import {
  ContextNotLoadedError,
  ServiceNotFoundError,
  TaskNotFoundError,
  ContainerNotRunningError,
} from "../errors";
import { buildPrefix, buildServiceName } from "../utils/nameBuilder";
import {
  resolveInstance,
  createInstance,
  validateInstanceKey,
  DEFAULT_INSTANCE_KEY,
} from "./instanceResolver";
import { initializePorts, loadPortsForInstance } from "../config/portsManager";
import { loadState, updateState } from "../config/stateLoader";
import {
  collectManagedVolumeSpecs,
  initializeManagedVolumes,
  loadVolumesForInstance,
} from "../config/volumeManager";
import {
  getProjectRootHash,
  getSystemRegistryId,
  touchSystemProject,
} from "../system/SystemRegistry";
import { VERSION } from "../version";

const READ_ONLY_STATE_COMMANDS = new Set([
  "config",
  "git:status",
  "home",
  "links",
  "logs",
  "ls",
  "notes",
  "startup-log",
  "state",
  "status",
]);

export interface ProjectKillTargets {
  projectName: string;
  prefix: string;
  nativeProcesses: string[];
  containers: string[];
}

export class Zapper {
  private context: Context | null = null;
  constructor() {}

  async loadConfig(
    configPath?: string,
    cliOptions?: Record<string, any>,
  ): Promise<void> {
    const resolvedPath = resolveConfigPath(configPath);

    if (!resolvedPath) {
      throw new Error(
        configPath
          ? `Config file not found: ${configPath}`
          : "No zap.yaml config file found in current directory or parent directories",
      );
    }

    const absoluteConfigPath = path.resolve(resolvedPath);
    const projectRoot = path.dirname(absoluteConfigPath);
    const config = parseYamlFile(resolvedPath);

    // Apply CLI overrides to config
    const configWithOverrides = this.applyCliOverrides(config, cliOptions);

    // Create context from config
    const profileName =
      typeof cliOptions?.profile === "string" &&
      cliOptions.profile.trim().length > 0
        ? cliOptions.profile.trim()
        : undefined;

    this.context = createContext(configWithOverrides, projectRoot, {
      profileName,
    });

    this.context.configPath = absoluteConfigPath;

    const profileStackKey = this.context.profile?.isolate
      ? this.context.profile.name
      : DEFAULT_INSTANCE_KEY;

    const rawInstanceOpt = cliOptions?.instance;

    const explicitInstanceKey =
      typeof rawInstanceOpt === "string" && rawInstanceOpt.trim().length > 0
        ? rawInstanceOpt.trim()
        : undefined;

    const selectedInstanceKey = explicitInstanceKey ?? profileStackKey;

    if (selectedInstanceKey) {
      validateInstanceKey(selectedInstanceKey);
      this.context.instanceKey = selectedInstanceKey;
    }

    const commandName = cliOptions?.__command;

    const readOnlyStateCommand =
      typeof commandName === "string" &&
      READ_ONLY_STATE_COMMANDS.has(commandName);

    const instanceResolution = await resolveInstance(
      projectRoot,
      selectedInstanceKey,
      {
        autoCreate: !readOnlyStateCommand,
        allowMissing: readOnlyStateCommand,
      },
    );

    this.context.instanceKey = instanceResolution.instanceKey;
    this.context.instanceId = instanceResolution.instanceId;

    // Centralized command boot sequence hook:
    // Ensure instance-scoped ports exist before env resolution for any
    // config-backed command so startup does not depend on `up` running first.
    if (!readOnlyStateCommand && (commandName || !this.context.instance)) {
      initializePorts(
        projectRoot,
        this.context.ports || [],
        instanceResolution.instanceKey,
      );

      if (commandName !== "volume") {
        initializeManagedVolumes(
          projectRoot,
          this.context.projectName,
          instanceResolution.instanceKey,
          instanceResolution.instanceId,
          collectManagedVolumeSpecs(this.context.containers),
        );
      }
    }

    // Refresh state after any implicit initialization so commands like `state`
    // observe the latest persisted instance/port data on first run.
    this.context.state = loadState(projectRoot);

    if (!readOnlyStateCommand && instanceResolution.instanceId) {
      const stackKey = explicitInstanceKey ?? profileStackKey;
      const stackProfile = this.context.profile?.name ?? DEFAULT_INSTANCE_KEY;
      updateState(projectRoot, (state) => {
        const instance = state.instances?.[instanceResolution.instanceKey];
        return {
          stacks: {
            ...(state.stacks || {}),
            [stackKey]: {
              stackId: instanceResolution.instanceId,
              profile: stackProfile,
              ports: instance?.ports,
              volumes: instance?.volumes,
            },
          },
        };
      });

      this.context.state = loadState(projectRoot);
    }

    this.context.instance = {
      key: instanceResolution.instanceKey,
      id: instanceResolution.instanceId,
      label:
        this.context.state.instances?.[instanceResolution.instanceKey]?.label,
      ports: loadPortsForInstance(projectRoot, instanceResolution.instanceKey),
      volumes: loadVolumesForInstance(
        projectRoot,
        instanceResolution.instanceKey,
      ),
    };

    // Resolve environment variables with proper path resolution
    this.context = EnvResolver.resolveContext(this.context);
    this.context.configPath = absoluteConfigPath;

    if (!cliOptions?.__skipSystemRegistryTouch) {
      const touchResult = touchSystemProject({
        context: this.context,
        configPath: absoluteConfigPath,
        command:
          typeof cliOptions?.__command === "string"
            ? cliOptions.__command
            : undefined,
        zapperVersion: VERSION,
      });

      if (touchResult.projectNameChanged) {
        renderer.log.warn(
          `Project name changed from ${touchResult.projectNameChanged.from} to ${touchResult.projectNameChanged.to}. Old resources may still be running; run \`zap system resources audit\`.`,
        );
      }
    }
  }

  private applyCliOverrides(
    config: ZapperConfig,
    cliOptions?: Record<string, any>,
  ): ZapperConfig {
    if (!cliOptions) return config;

    const configWithOverrides = { ...config };

    // Handle git method CLI overrides
    if (cliOptions.http && cliOptions.ssh) {
      throw new Error("Cannot specify both --http and --ssh options");
    }

    if (cliOptions.http) {
      configWithOverrides.git_method = "http";
    } else if (cliOptions.ssh) {
      configWithOverrides.git_method = "ssh";
    }

    return configWithOverrides;
  }

  getProject(): string | null {
    return this.context?.projectName ?? null;
  }

  getProjectRoot(): string | null {
    return this.context?.projectRoot ?? null;
  }

  getContext(): Context | null {
    return this.context;
  }

  private getProcesses(): Process[] {
    if (!this.context) {
      throw new ContextNotLoadedError();
    }

    return this.context.processes;
  }

  private getContainers(): Array<[string, Container]> {
    if (!this.context) throw new ContextNotLoadedError();
    return this.context.containers.map((c) => [c.name, c]);
  }

  private resolveAliasesToCanonical(names?: string[]): string[] | undefined {
    if (!names || !this.context) return names;
    return resolveAliasesToCanonical(names, buildServiceAliasMap(this.context));
  }

  private resolveActionTargets(names?: string[]): string[] | undefined {
    if (!names || !this.context) return names;

    const aliasMap = buildServiceAliasMap(this.context);

    const existingServices = new Set([
      ...this.context.processes.map((p) => p.name),
      ...this.context.containers.map((c) => c.name),
    ]);

    for (const requestedName of names) {
      const canonicalName = aliasMap[requestedName] || requestedName;

      if (!existingServices.has(canonicalName)) {
        renderer.log.warn(`Service not found: ${requestedName}. Skipping.`);
      }
    }

    return resolveAliasesToCanonical(names, aliasMap);
  }

  resolveServiceName(name: string): string {
    const resolved = this.resolveAliasesToCanonical([name]);
    return resolved && resolved.length > 0 ? resolved[0] : name;
  }

  private buildTaskAliasMap(): Record<string, string> {
    if (!this.context || !this.context.tasks) return {};

    const aliasToName = new Map<string, string>();

    for (const task of this.context.tasks) {
      aliasToName.set(task.name, task.name);

      if (Array.isArray(task.aliases)) {
        for (const alias of task.aliases) {
          aliasToName.set(alias, task.name);
        }
      }
    }

    return Object.fromEntries(aliasToName);
  }

  resolveTaskName(name: string): string | undefined {
    const resolved = this.buildTaskAliasMap()[name];
    return resolved;
  }

  // Helper method to create a legacy config for backwards compatibility
  // TODO: Remove this once all components are updated to use Context
  private createLegacyConfig(): ZapperConfig {
    if (!this.context) throw new ContextNotLoadedError();

    const registryId = this.context.configPath
      ? getSystemRegistryId(this.context.projectRoot, this.context.configPath)
      : undefined;

    const projectRootHash = getProjectRootHash(this.context.projectRoot);

    // Convert processes to native format
    const native: Record<string, any> = {};

    for (const process of this.context.processes) {
      native[process.name] = {
        ...process,
        resolvedEnv: {
          ...(process.resolvedEnv || {}),
          ZAPPER_PROJECT: this.context.projectName,
          ZAPPER_SERVICE: process.name,
          ZAPPER_INSTANCE_ID: this.context.instanceId || "",
          ZAPPER_INSTANCE_KEY: this.context.instanceKey,
          ...(registryId ? { ZAPPER_REGISTRY_ID: registryId } : {}),
          ZAPPER_PROJECT_ROOT_HASH: projectRootHash,
        },
        name: process.name, // Keep the name field for compatibility
      };
    }

    // Convert containers back to docker format
    const docker: Record<string, any> = {};

    for (const container of this.context.containers) {
      docker[container.name] = {
        ...container,
        name: container.name, // Keep the name field for compatibility
      };
    }

    // Convert tasks back to tasks format
    const tasks: Record<string, any> = {};

    for (const task of this.context.tasks) {
      tasks[task.name] = {
        ...task,
        name: task.name, // Keep the name field for compatibility
      };
    }

    return {
      project: this.context.projectName,
      env_files: this.context.envFiles,
      git_method: this.context.gitMethod,
      runtime: this.context.runtime,
      native,
      docker,
      volumes: this.context.volumes ?? {},
      secrets: this.context.secrets ?? {},
      tasks,
      instanceId: this.context.instanceId,
      instanceKey: this.context.instanceKey,
      configPath: this.context.configPath,
    } as ZapperConfig & { instanceId?: string | null; configPath?: string };
  }

  async startProcesses(
    processNames?: string[],
    reporter?: ServiceActionReporter,
  ): Promise<ServiceActionReport> {
    if (!this.context) throw new ContextNotLoadedError();

    const allProcesses = this.getProcesses();
    const allContainers = this.getContainers();

    if (allProcesses.length === 0 && allContainers.length === 0) {
      throw new ServiceNotFoundError("any", "No processes defined in config");
    }

    // TODO: Update Planner to work with Context
    // For now, we'll need a temporary legacy config for backwards compatibility
    const legacyConfig = this.createLegacyConfig();
    const planner = new Planner(legacyConfig);
    const canonical = this.resolveActionTargets(processNames);

    const plan = await planner.plan(
      "start",
      canonical,
      this.context.projectName,
      false,
    );

    const executionReport = await executeActions(
      legacyConfig,
      this.context.projectName,
      this.context.projectRoot,
      plan,
      reporter,
    );

    return {
      ...emptyServiceActionReport("up", processNames),
      ...executionReport,
    };
  }

  async stopProcesses(
    processNames?: string[],
    reporter?: ServiceActionReporter,
  ): Promise<ServiceActionReport> {
    if (!this.context) throw new ContextNotLoadedError();

    const legacyConfig = this.createLegacyConfig();
    const planner = new Planner(legacyConfig);
    const canonical = this.resolveActionTargets(processNames);

    const plan = await planner.plan(
      "stop",
      canonical,
      this.context.projectName,
      false,
    );

    const executionReport = await executeActions(
      legacyConfig,
      this.context.projectName,
      this.context.projectRoot,
      plan,
      reporter,
    );

    return {
      ...emptyServiceActionReport("down", processNames),
      ...executionReport,
    };
  }

  async stopProfileProcesses(
    profileName: string,
    processNames: string[],
    reporter?: ServiceActionReporter,
  ): Promise<ServiceActionReport> {
    if (!this.context) throw new ContextNotLoadedError();

    const configPath = this.context.configPath;

    if (!configPath) {
      throw new Error("Config path not loaded");
    }

    const zapper = new Zapper();
    await zapper.loadConfig(configPath, {
      profile: profileName,
      __command: "profile",
      __skipSystemRegistryTouch: true,
    });

    return zapper.stopProcesses(processNames, reporter);
  }

  async restartProcesses(
    processNames?: string[],
    reporter?: ServiceActionReporter,
  ): Promise<ServiceActionReport> {
    if (!this.context) throw new ContextNotLoadedError();
    const legacyConfig = this.createLegacyConfig();
    const planner = new Planner(legacyConfig);
    const canonical = this.resolveActionTargets(processNames);

    const plan = await planner.plan(
      "restart",
      canonical,
      this.context.projectName,
      false,
    );

    const executionReport = await executeActions(
      legacyConfig,
      this.context.projectName,
      this.context.projectRoot,
      plan,
      reporter,
    );

    return {
      ...emptyServiceActionReport("restart", processNames),
      ...executionReport,
    };
  }

  async watchServices(serviceNames?: string[]): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();

    const canonical = this.resolveActionTargets(serviceNames);
    const selected = new Set(canonical);

    const containers = this.context.containers.filter((container) => {
      if (!container.watch || container.watch.length === 0) return false;
      return (
        !canonical || canonical.length === 0 || selected.has(container.name)
      );
    });

    if (containers.length === 0) {
      throw new Error(
        serviceNames && serviceNames.length > 0
          ? "No selected Docker services define watch rules"
          : "No Docker services define watch rules",
      );
    }

    await this.startProcesses(containers.map((container) => container.name));

    const watchers: fs.FSWatcher[] = [];
    const pending = new Map<string, NodeJS.Timeout>();
    const pendingActions = new Map<string, "restart" | "rebuild">();

    const schedule = (serviceName: string, action: "restart" | "rebuild") => {
      const previous = pendingActions.get(serviceName);
      pendingActions.set(
        serviceName,
        previous === "rebuild" || action === "rebuild" ? "rebuild" : "restart",
      );

      const existing = pending.get(serviceName);
      if (existing) clearTimeout(existing);
      pending.set(
        serviceName,
        setTimeout(async () => {
          pending.delete(serviceName);
          const nextAction = pendingActions.get(serviceName) || "restart";
          pendingActions.delete(serviceName);
          renderer.log.info(
            nextAction === "rebuild"
              ? `Rebuilding ${serviceName} after file change...`
              : `Restarting ${serviceName} after file change...`,
          );

          if (nextAction === "rebuild") {
            await this.restartProcesses([serviceName]);
          } else {
            await DockerManager.restartContainer(
              buildServiceName(
                this.context!.projectName,
                serviceName,
                this.context!.instanceId,
              ),
            );
          }
        }, 250),
      );
    };

    for (const container of containers) {
      for (const rule of container.watch || []) {
        const watchPath = path.isAbsolute(rule.path)
          ? rule.path
          : path.join(this.context.projectRoot, rule.path);

        if (!fs.existsSync(watchPath)) {
          renderer.log.warn(
            `Watch path does not exist for ${container.name}: ${rule.path}`,
          );

          continue;
        }

        watchers.push(
          fs.watch(watchPath, { recursive: true }, () => {
            schedule(container.name, rule.action);
          }),
        );

        renderer.log.info(
          `Watching ${rule.path} for ${container.name} (${rule.action})`,
        );
      }
    }

    if (watchers.length === 0) {
      throw new Error("No watch paths could be opened");
    }

    await new Promise<void>((resolve) => {
      const stop = () => {
        for (const watcher of watchers) watcher.close();
        for (const timeout of pending.values()) clearTimeout(timeout);
        resolve();
      };

      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }

  private resolveProjectNameForKill(projectName?: string): string {
    if (projectName && projectName.trim().length > 0) {
      return projectName.trim();
    }

    if (this.context?.projectName) {
      return this.context.projectName;
    }

    throw new Error(
      "No project name provided. Run from a project with zap.yaml or pass one explicitly: zap kill <project>",
    );
  }

  async getProjectKillTargets(
    projectName?: string,
  ): Promise<ProjectKillTargets> {
    const resolvedProjectName = this.resolveProjectNameForKill(projectName);
    const prefix = buildPrefix(resolvedProjectName);
    const scopedPrefix = `${prefix}.`;

    const nativeProcesses = (await NativeProcessManager.listProcesses())
      .map((process) => process.name)
      .filter((name) => name.startsWith(scopedPrefix))
      .sort();

    const containers = (await DockerManager.listContainers())
      .map((container) => container.name)
      .filter((name) => name.startsWith(scopedPrefix))
      .sort();

    return {
      projectName: resolvedProjectName,
      prefix,
      nativeProcesses: Array.from(new Set(nativeProcesses)),
      containers: Array.from(new Set(containers)),
    };
  }

  async killProjectResources(
    targets?: ProjectKillTargets,
    projectName?: string,
  ): Promise<ProjectKillTargets> {
    const resolvedTargets =
      targets ?? (await this.getProjectKillTargets(projectName));

    for (const processName of resolvedTargets.nativeProcesses) {
      await NativeProcessManager.deleteProcess(processName);
    }

    for (const containerName of resolvedTargets.containers) {
      await DockerManager.removeContainer(containerName);
    }

    return resolvedTargets;
  }

  async showLogs(processName: string, follow: boolean = false): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();

    const projectName = this.context.projectName;
    const projectRoot = this.context.projectRoot;
    const resolvedName = this.resolveServiceName(processName);

    const isContainer = this.context.containers.some(
      (c) => c.name === resolvedName,
    );

    const isProcess = this.context.processes.some(
      (p) => p.name === resolvedName,
    );

    if (isContainer) {
      const dockerName = buildServiceName(
        projectName,
        resolvedName,
        this.context.instanceId,
      );

      const exists = await DockerManager.containerExists(dockerName);

      if (!exists) {
        const logContext = {
          projectName,
          serviceName: resolvedName,
          configDir: projectRoot,
        };

        if (DockerManager.startupLogExists(logContext)) {
          renderer.log.warn(
            `${resolvedName} is not currently running. Showing Docker startup log.`,
          );

          await DockerManager.showStartupLog(logContext);
          return;
        }

        throw new ContainerNotRunningError(resolvedName, dockerName);
      }

      await DockerManager.showLogs(dockerName, follow);
    } else if (isProcess) {
      const nativeProcessExecutor = new NativeProcessExecutor(
        projectName,
        projectRoot,
        this.context.instanceId,
      );

      await nativeProcessExecutor.showLogs(resolvedName, follow);
    } else {
      throw new ServiceNotFoundError(processName);
    }
  }

  async showStartupLog(serviceName: string): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();

    const resolvedName = this.resolveServiceName(serviceName);

    const isKnownService =
      this.context.containers.some((c) => c.name === resolvedName) ||
      this.context.processes.some((p) => p.name === resolvedName);

    if (!isKnownService) {
      throw new ServiceNotFoundError(serviceName);
    }

    const startupLogContext = {
      projectName: this.context.projectName,
      serviceName: resolvedName,
      configDir: this.context.projectRoot,
    };

    if (!DockerManager.startupLogExists(startupLogContext)) {
      throw new Error(`No startup log found for service: ${resolvedName}`);
    }

    await DockerManager.showStartupLog(startupLogContext);
  }

  async reset(force = false): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();

    const proceed = force
      ? true
      : await confirm(renderer.confirm.zapperResetPromptText());

    if (!proceed) {
      renderer.log.info(renderer.command.abortedText());
      return;
    }

    await this.stopProcesses();
    const zapDir = path.join(this.context.projectRoot, ".zap");

    if (fs.existsSync(zapDir)) {
      // stopProcesses only covers the current stack. Deleting .zap while any
      // other stack/instance of this local copy still has a native process
      // registration
      // would leave that registration pointing at a missing wrapper script,
      // which crash-loops unbounded — deregister them all first.
      await NativeProcessManager.deregisterAppsUnderZapDir(zapDir);
      fs.rmSync(zapDir, { recursive: true, force: true });
      renderer.log.info(renderer.command.removedZapDirText());
    } else {
      renderer.log.info(renderer.command.missingZapDirText());
    }
  }

  async isolateInstance(): Promise<string> {
    if (!this.context) throw new ContextNotLoadedError();

    const instanceId = createInstance(
      this.context.projectRoot,
      this.context.instanceKey,
    );

    this.context.instanceId = instanceId;
    this.context.instance = {
      key: this.context.instanceKey,
      id: instanceId,
      ports: loadPortsForInstance(
        this.context.projectRoot,
        this.context.instanceKey,
      ),
      volumes: loadVolumesForInstance(
        this.context.projectRoot,
        this.context.instanceKey,
      ),
    };

    return instanceId;
  }

  async cloneRepos(processNames?: string[]): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();
    const legacyConfig = this.createLegacyConfig();
    await cloneRepositories(
      legacyConfig,
      this.context.projectRoot,
      processNames,
    );
  }

  async runTask(
    taskName: string,
    params?: { named: Record<string, string>; rest: string[] },
    options?: { force?: boolean; promptMissingParams?: boolean },
  ): Promise<void> {
    if (!this.context) throw new ContextNotLoadedError();

    if (!this.context.tasks || this.context.tasks.length === 0) {
      throw new TaskNotFoundError(taskName, "No tasks defined in config");
    }

    // Build task alias map for resolution
    const taskAliasMap = this.buildTaskAliasMap();
    const resolvedTaskName = taskAliasMap[taskName];

    if (!resolvedTaskName) {
      throw new TaskNotFoundError(taskName);
    }

    // Convert tasks array back to object format for TaskRunner
    const tasks: Record<string, any> = {};

    for (const task of this.context.tasks) {
      tasks[task.name] = task;
    }

    // Use TaskRunner for execution with interpolation support
    const { TaskRunner } = await import("./tasks/TaskRunner");
    await TaskRunner.runTask(
      tasks,
      this.context.projectRoot,
      resolvedTaskName,
      {
        delimiters: this.context.taskDelimiters,
        params,
        force: options?.force,
        promptMissingParams: options?.promptMissingParams,
        context: {
          projectName: this.context.projectName,
          instanceKey: this.context.instanceKey,
        },
      },
    );
  }

  private getNativeTargets(): Array<{ name: string; cwd: string }> {
    const legacyConfig = this.createLegacyConfig();
    return getNativeTargets(legacyConfig, this.context?.projectRoot || null);
  }

  async gitCheckoutAll(branch: string): Promise<void> {
    const targets = this.getNativeTargets();
    await GitManager.checkoutAll(targets, branch);
  }

  async gitPullAll(): Promise<void> {
    const targets = this.getNativeTargets();
    await GitManager.pullAll(targets);
  }

  async gitStatusAll(): Promise<void> {
    const targets = this.getNativeTargets();
    await GitManager.statusAll(targets);
  }

  async gitStashAll(): Promise<void> {
    const targets = this.getNativeTargets();
    await GitManager.stashAll(targets);
  }
}
