import { CommandHandler, CommandContext } from "./CommandHandler";
import { CommandResult } from "./CommandResult";
import { confirm } from "../utils/confirm";
import { ProjectKillTargets } from "../core/Zapper";
import { buildPrefix, parseServiceName } from "../utils/nameBuilder";
import { Pm2Manager } from "../core/process/Pm2Manager";
import { DockerManager } from "../core/docker/DockerManager";

export class GlobalCommand extends CommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const { zapper, options, service } = context;

    // Parse subcommand from service parameter
    const subcommand = Array.isArray(service) ? service[0] : service;
    const projectName = Array.isArray(service) && service.length > 1 ? service[1] : undefined;

    if (!subcommand) {
      throw new Error("Global command requires a subcommand: info, list, or kill");
    }

    switch (subcommand) {
      case "info":
      case "list":
      case "l":
        return await this.handleList(options.all, projectName, zapper);
      case "kill":
        return await this.handleKill(zapper, projectName, options.all, options.force);
      default:
        throw new Error(`Unknown global subcommand: ${subcommand}. Use info, list, or kill.`);
    }
  }


  private async handleList(all?: boolean, projectName?: string, zapper?: any): Promise<CommandResult> {
    if (all) {
      const projects = await this.getAllProjects();
      return {
        kind: "global.list",
        allProjects: true,
        projects: projects,
      };
    } else if (projectName) {
      // Show info for specific project
      const targets = await this.getProjectTargets(projectName);
      return {
        kind: "global.list",
        allProjects: false,
        projects: [{
          name: targets.projectName,
          prefix: targets.prefix,
          pm2: targets.pm2,
          containers: targets.containers,
        }],
      };
    } else {
      // Try to load config to get current project name
      if (!zapper) {
        throw new Error("Specify a project name or use --all flag to list all projects");
      }

      try {
        await zapper.loadConfig();
        const projectName = zapper.getProject();
        if (!projectName) {
          throw new Error("No project name provided and not in a project directory. Use --all flag or specify: zap global list <project>");
        }

        // Show current project
        const targets = await this.getProjectTargets(projectName);
        return {
          kind: "global.list",
          allProjects: false,
          projects: [{
            name: targets.projectName,
            prefix: targets.prefix,
            pm2: targets.pm2,
            containers: targets.containers,
          }],
        };
      } catch (error) {
        throw new Error("No project name provided and not in a project directory. Use --all flag or specify: zap global list <project>");
      }
    }
  }

  private async handleKill(zapper: any, projectName?: string, all?: boolean, force?: boolean): Promise<CommandResult> {
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

      const totalPm2 = projects.reduce((sum, p) => sum + p.pm2.length, 0);
      const totalContainers = projects.reduce((sum, p) => sum + p.containers.length, 0);
      const projectNames = projects.map(p => p.name).join(", ");

      const proceed = await confirm(
        `This will permanently delete ALL PM2 processes and Docker containers for ALL zap projects (${projects.length} projects: ${projectNames}). Found ${totalPm2} PM2 process(es) and ${totalContainers} container(s) total. Continue?`,
        { defaultYes: false, force }
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
          pm2: project.pm2,
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
          throw new Error("Specify a project name or use --all flag to kill all projects");
        }

        try {
          await zapper.loadConfig();
          const resolvedProject = zapper.getProject();
          if (!resolvedProject) {
            throw new Error("No project name provided and not in a project directory. Use --all flag or specify: zap global kill <project>");
          }
          projectName = resolvedProject;
        } catch (error) {
          if (error instanceof Error && error.message.includes("No project name provided")) {
            throw error;
          }
          throw new Error("No project name provided and not in a project directory. Use --all flag or specify: zap global kill <project>");
        }
      }

      const targets = await this.getProjectTargets(projectName!);
      const projects = [{
        name: targets.projectName,
        prefix: targets.prefix,
        pm2: targets.pm2,
        containers: targets.containers,
      }];

      const proceed = await confirm(
        `This will permanently delete all PM2 processes and Docker containers across ALL instances for project "${targets.projectName}" (prefix "${targets.prefix}."). Found ${targets.pm2.length} PM2 process(es) and ${targets.containers.length} container(s). Continue?`,
        { defaultYes: false, force }
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

  private async getProjectTargets(projectName: string): Promise<ProjectKillTargets> {
    const prefix = buildPrefix(projectName);
    const scopedPrefix = `${prefix}.`;

    const pm2 = (await Pm2Manager.listProcesses())
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
      pm2: Array.from(new Set(pm2)),
      containers: Array.from(new Set(containers)),
    };
  }

  private async getAllProjects(): Promise<Array<{ name: string; prefix: string; pm2: string[]; containers: string[]; }>> {
    const [allPm2, allContainers] = await Promise.all([
      Pm2Manager.listProcesses(),
      DockerManager.listContainers()
    ]);

    const projectMap = new Map<string, { name: string; prefix: string; pm2: string[]; containers: string[]; }>();

    // Process PM2 processes
    for (const process of allPm2) {
      const parsed = parseServiceName(process.name);
      if (parsed) {
        if (!projectMap.has(parsed.project)) {
          projectMap.set(parsed.project, {
            name: parsed.project,
            prefix: buildPrefix(parsed.project),
            pm2: [],
            containers: [],
          });
        }
        projectMap.get(parsed.project)!.pm2.push(process.name);
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
            pm2: [],
            containers: [],
          });
        }
        projectMap.get(parsed.project)!.containers.push(container.name);
      }
    }

    // Sort and dedupe arrays
    for (const project of projectMap.values()) {
      project.pm2 = Array.from(new Set(project.pm2)).sort();
      project.containers = Array.from(new Set(project.containers)).sort();
    }

    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async killProjectResources(targets: ProjectKillTargets): Promise<void> {
    for (const processName of targets.pm2) {
      await Pm2Manager.deleteProcess(processName);
    }

    for (const containerName of targets.containers) {
      await DockerManager.removeContainer(containerName);
    }
  }
}