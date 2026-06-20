import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { confirm } from "../utils/confirm";
import { ProjectKillTargets, Zapper } from "../core/Zapper";
import { buildPrefix, parseServiceName } from "../utils/nameBuilder";
import { NativeProcessManager } from "../core/process/NativeProcessManager";
import { DockerManager } from "../core/docker/DockerManager";
import { renderer } from "../ui/renderer";
import {
  auditSystemResources,
  cleanupSystemResources,
  getStaleSystemRegistryProjects,
  pruneSystemRegistry,
} from "../system";
import { OrphanScanner } from "../system/OrphanScanner";
import { PortOrphanScanner } from "../system/PortOrphanScanner";

export class GlobalCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options, service } = context;

    // Parse subcommand from service parameter
    const subcommand = Array.isArray(service) ? service[0] : service;

    const projectName =
      Array.isArray(service) && service.length > 1 ? service[1] : undefined;

    if (!subcommand) {
      throw new Error(
        "Global command requires a subcommand: info, list, prune, or kill",
      );
    }

    switch (subcommand) {
      case "info":
      case "list":
      case "ls":
      case "l":
        return await this.handleList(projectName);
      case "prune":
        if (projectName) {
          throw new Error("Global prune does not accept a project argument");
        }

        return await this.handlePrune(options.force);
      case "kill":
        return await this.handleKill(
          zapper,
          projectName,
          options.all,
          options.force,
        );
      default:
        throw new Error(
          `Unknown global subcommand: ${subcommand}. Use info, list, prune, or kill.`,
        );
    }
  }

  private async handleList(projectName?: string): Promise<CommandResult> {
    const orphans = await this.findOrphanProcesses();

    if (projectName) {
      // Show info for specific project
      const targets = await this.getProjectTargets(projectName);
      return {
        kind: "global.list",
        allProjects: false,
        projects: [
          {
            name: targets.projectName,
            prefix: targets.prefix,
            nativeProcesses: targets.nativeProcesses,
            containers: targets.containers,
          },
        ],
        orphans,
      };
    }

    const projects = await this.getAllProjects();
    return {
      kind: "global.list",
      allProjects: true,
      projects,
      orphans,
    };
  }

  /**
   * Processes still doing Zapper work that the supervisor no longer tracks.
   * Found two ways: OS processes running a .zap wrapper script, and listeners
   * on zap-assigned ports outside any supervisor-managed process tree.
   */
  private async findOrphanProcesses(): Promise<
    Array<{ name: string; pid: number; location: string; reason: string }>
  > {
    const managedPids = new Set(
      (await NativeProcessManager.listProcesses())
        .map((process) => process.pid)
        .filter(Boolean),
    );

    const wrapperOrphans = OrphanScanner.findUnmanagedWrapperRoots(managedPids);

    const ignorePids = new Set(wrapperOrphans.map((wrapper) => wrapper.pid));

    const portOrphans = PortOrphanScanner.findOrphanPortListeners(
      managedPids,
      ignorePids,
    );

    return [
      ...wrapperOrphans.map((wrapper) => ({
        name: `pid ${wrapper.pid}`,
        pid: wrapper.pid,
        location: wrapper.scriptPath,
        reason: "Running a Zapper wrapper but unknown to the supervisor",
      })),
      ...portOrphans.map((orphan) => ({
        name: `pid ${orphan.pid} (${orphan.command})`,
        pid: orphan.pid,
        location: `${orphan.project} port ${orphan.port} ($${orphan.portName})`,
        reason: `Listening on zap-assigned port ${orphan.port} but unknown to the supervisor`,
      })),
    ];
  }

  private async handlePrune(force?: boolean): Promise<CommandResult> {
    const staleProjects = getStaleSystemRegistryProjects();
    const audit = await auditSystemResources();
    const resources = audit.resources;

    if (staleProjects.length === 0 && resources.length === 0) {
      return {
        kind: "global.prune",
        status: "completed",
        staleProjects,
        removedProjects: [],
        resources: [],
      };
    }

    renderer.log.report(
      renderer.command.globalPrunePlanText({ staleProjects, resources }),
    );

    const proceed = await confirm(
      renderer.confirm.deleteResourcesPromptText(),
      { defaultYes: false, force },
    );

    if (!proceed) {
      return {
        kind: "global.prune",
        status: "aborted",
        staleProjects,
        removedProjects: [],
        resources,
      };
    }

    const cleanup =
      resources.length > 0
        ? await cleanupSystemResources({ includeVolumes: true })
        : { resources: [] };

    const removedProjects = pruneSystemRegistry();

    return {
      kind: "global.prune",
      status: "completed",
      staleProjects,
      removedProjects,
      resources: cleanup.resources,
    };
  }

  private async handleKill(
    zapper: Zapper,
    projectName?: string,
    all?: boolean,
    force?: boolean,
  ): Promise<CommandResult> {
    if (all) {
      // Kill all projects
      const projects = await this.getAllProjects();

      if (projects.length === 0) {
        return {
          kind: "global.kill",
          status: "completed",
          allProjects: true,
          projects: [],
        };
      }

      const totalNativeProcesses = projects.reduce((sum, p) => sum + p.nativeProcesses.length, 0);

      const totalContainers = projects.reduce(
        (sum, p) => sum + p.containers.length,
        0,
      );

      renderer.log.info(
        renderer.confirm.globalKillAllPromptText({
          projectCount: projects.length,
          projectNames: projects.map((p) => p.name),
          nativeProcessCount: totalNativeProcesses,
          containerCount: totalContainers,
        }),
      );

      renderer.log.report(renderer.command.globalListText(projects, true));

      const proceed = await confirm(
        renderer.confirm.deleteResourcesPromptText(),
        { defaultYes: false, force },
      );

      if (!proceed) {
        return {
          kind: "global.kill",
          status: "aborted",
          allProjects: true,
          projects,
        };
      }

      // Kill all projects
      for (const project of projects) {
        await this.killProjectResources({
          projectName: project.name,
          prefix: project.prefix,
          nativeProcesses: project.nativeProcesses,
          containers: project.containers,
        });
      }

      return {
        kind: "global.kill",
        status: "completed",
        allProjects: true,
        projects,
      };
    } else {
      // Kill single project
      if (!projectName) {
        // Try to load config to get current project name
        if (!zapper) {
          throw new Error(
            "Specify a project name or use --all flag to kill all projects",
          );
        }

        try {
          await zapper.loadConfig();
          const resolvedProject = zapper.getProject();

          if (!resolvedProject) {
            throw new Error(
              "No project name provided and not in a project directory. Use --all flag or specify: zap global kill <project>",
            );
          }

          projectName = resolvedProject;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("No project name provided")
          ) {
            throw error;
          }

          throw new Error(
            "No project name provided and not in a project directory. Use --all flag or specify: zap global kill <project>",
          );
        }
      }

      const targets = await this.getProjectTargets(projectName!);

      const projects = [
        {
          name: targets.projectName,
          prefix: targets.prefix,
          nativeProcesses: targets.nativeProcesses,
          containers: targets.containers,
        },
      ];

      renderer.log.report(renderer.command.globalListText(projects, false));
      renderer.log.info(
        renderer.confirm.killProjectPromptText({
          projectName: targets.projectName,
          prefix: targets.prefix,
          nativeProcessCount: targets.nativeProcesses.length,
          containerCount: targets.containers.length,
        }),
      );

      const proceed = await confirm(
        renderer.confirm.deleteResourcesPromptText(),
        { defaultYes: false, force },
      );

      if (!proceed) {
        return {
          kind: "global.kill",
          status: "aborted",
          allProjects: false,
          projects,
        };
      }

      await this.killProjectResources(targets);
      return {
        kind: "global.kill",
        status: "completed",
        allProjects: false,
        projects,
      };
    }
  }

  private async getProjectTargets(
    projectName: string,
  ): Promise<ProjectKillTargets> {
    const prefix = buildPrefix(projectName);
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
      projectName,
      prefix,
      nativeProcesses: Array.from(new Set(nativeProcesses)),
      containers: Array.from(new Set(containers)),
    };
  }

  private async getAllProjects(): Promise<
    Array<{ name: string; prefix: string; nativeProcesses: string[]; containers: string[] }>
  > {
    const [allNativeProcesses, allContainers] = await Promise.all([
      NativeProcessManager.listProcesses(),
      DockerManager.listContainers(),
    ]);

    const projectMap = new Map<
      string,
      { name: string; prefix: string; nativeProcesses: string[]; containers: string[] }
    >();

    // Process native supervisor entries
    for (const process of allNativeProcesses) {
      const parsed = parseServiceName(process.name);

      if (parsed) {
        if (!projectMap.has(parsed.project)) {
          projectMap.set(parsed.project, {
            name: parsed.project,
            prefix: buildPrefix(parsed.project),
            nativeProcesses: [],
            containers: [],
          });
        }

        projectMap.get(parsed.project)!.nativeProcesses.push(process.name);
      }
    }

    // Process Docker containers
    for (const container of allContainers) {
      const parsed = parseServiceName(container.name);

      if (parsed) {
        if (!projectMap.has(parsed.project)) {
          projectMap.set(parsed.project, {
            name: parsed.project,
            prefix: buildPrefix(parsed.project),
            nativeProcesses: [],
            containers: [],
          });
        }

        projectMap.get(parsed.project)!.containers.push(container.name);
      }
    }

    // Sort and dedupe arrays
    for (const project of projectMap.values()) {
      project.nativeProcesses = Array.from(new Set(project.nativeProcesses)).sort();
      project.containers = Array.from(new Set(project.containers)).sort();
    }

    return Array.from(projectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private async killProjectResources(
    targets: ProjectKillTargets,
  ): Promise<void> {
    for (const processName of targets.nativeProcesses) {
      await NativeProcessManager.deleteProcess(processName);
    }

    for (const containerName of targets.containers) {
      await DockerManager.removeContainer(containerName);
    }
  }
}
