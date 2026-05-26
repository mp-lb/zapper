import { ZapperConfig, Process, Container } from "../config/schemas";
import { Pm2Manager } from "./process/Pm2Manager";
import { DockerManager } from "./docker";
import { ActionPlan, ExecutionWave, Action } from "../types";
import { DependencyGraph } from "./DependencyGraph";
import { buildServiceName } from "../utils/nameBuilder";

export class Planner {
  constructor(private readonly config: ZapperConfig) {}

  private getProcesses(): Process[] {
    const { native, processes } = this.config;

    if (native && Object.keys(native).length > 0) {
      return Object.entries(native).map(([name, process]) => ({
        ...process,
        name: process.name || name,
      }));
    }

    return Array.isArray(processes) ? processes : [];
  }

  private getContainers(): Array<[string, Container]> {
    const dockerServices = this.config.docker || this.config.containers;
    if (!dockerServices) return [];
    return Object.entries(dockerServices).map(([name, c]) => [name, c]);
  }

  private buildGraph(): DependencyGraph {
    const graph = new DependencyGraph();
    for (const process of this.getProcesses()) {
      graph.addProcess(process.name as string, process);
    }
    for (const [name, container] of this.getContainers()) {
      graph.addContainer(name, container);
    }
    return graph;
  }

  private buildStopWave(servicesToStop: Set<string>): ExecutionWave[] {
    if (servicesToStop.size === 0) return [];

    const allProcessNames = new Set(
      this.getProcesses().map((p) => p.name as string),
    );
    const allContainerNames = new Set(
      this.getContainers().map(([name]) => name),
    );

    const actions: Action[] = [...servicesToStop].map((name) => ({
      type: "stop",
      serviceType: allProcessNames.has(name)
        ? "native"
        : allContainerNames.has(name)
          ? "docker"
          : "native",
      name,
    }));

    actions.sort((a, b) => a.name.localeCompare(b.name));
    return [{ actions }];
  }

  private resolveDependencies(
    targets: string[],
    allProcesses: Process[],
    allContainers: Array<[string, Container]>,
  ): { processes: Process[]; containers: Array<[string, Container]> } {
    const resolved = new Set<string>();
    const toResolve = [...targets];

    // Create a map for quick dependency lookup
    const dependencyMap = new Map<string, string[]>();
    for (const process of allProcesses) {
      dependencyMap.set(process.name as string, process.depends_on ?? []);
    }
    for (const [name, container] of allContainers) {
      dependencyMap.set(name, container.depends_on ?? []);
    }

    // Recursively resolve dependencies
    while (toResolve.length > 0) {
      const current = toResolve.pop()!;
      if (resolved.has(current)) continue;

      resolved.add(current);

      // Add dependencies to resolve list
      const deps = dependencyMap.get(current) ?? [];
      for (const dep of deps) {
        if (!resolved.has(dep)) {
          toResolve.push(dep);
        }
      }
    }

    return {
      processes: allProcesses.filter((p) => resolved.has(p.name as string)),
      containers: allContainers.filter(([name]) => resolved.has(name)),
    };
  }

  async plan(
    op: "start" | "stop" | "restart",
    targets: string[] | undefined,
    projectName: string,
    forceStart = false,
    resolveTargetDependencies = true,
  ): Promise<ActionPlan> {
    if (op === "restart") {
      const selectedTargets =
        targets && targets.length > 0
          ? targets
          : [
              ...this.getProcesses().map((p) => p.name as string),
              ...this.getContainers().map(([name]) => name),
            ];

      const stopPlan = await this.plan("stop", selectedTargets, projectName);
      const startPlan = await this.plan(
        "start",
        selectedTargets,
        projectName,
        true,
        false,
      );

      return { waves: [...stopPlan.waves, ...startPlan.waves] };
    }

    const graph = this.buildGraph();
    const allProcesses = this.getProcesses();
    const allContainers = this.getContainers();

    let selectedProcesses: Process[];
    let selectedContainers: Array<[string, Container]>;

    if (targets && targets.length > 0) {
      if (op === "start" && resolveTargetDependencies) {
        const resolved = this.resolveDependencies(
          targets,
          allProcesses,
          allContainers,
        );
        selectedProcesses = resolved.processes;
        selectedContainers = resolved.containers;
      } else {
        selectedProcesses = allProcesses.filter((p) =>
          targets.includes(p.name as string),
        );
        selectedContainers = allContainers.filter(([name]) =>
          targets.includes(name),
        );
      }
    } else {
      selectedProcesses = allProcesses;
      selectedContainers = allContainers;
    }

    const pm2List =
      selectedProcesses.length > 0 ? await Pm2Manager.listProcesses() : [];
    const onlinePm2 = new Set(
      pm2List
        .filter((p) => p.status.toLowerCase() === "online")
        .map((p) => p.name as string),
    );
    const existingPm2 = new Set(pm2List.map((p) => p.name as string));
    const instanceId = (this.config as ZapperConfig & { instanceId?: string })
      .instanceId;
    const isPm2Online = (name: string) =>
      onlinePm2.has(buildServiceName(projectName, name, instanceId));
    const hasPm2Process = (name: string) =>
      existingPm2.has(buildServiceName(projectName, name, instanceId));

    const shouldListContainers =
      selectedContainers.length > 0 && !(op === "start" && forceStart);
    const containerList = shouldListContainers
      ? await DockerManager.listContainers()
      : [];
    const containersByName = new Map(containerList.map((c) => [c.name, c]));
    const isDockerRunning = (name: string): boolean => {
      const info = containersByName.get(
        buildServiceName(projectName, name, instanceId),
      );
      return (
        !!info &&
        (info.status.toLowerCase() === "running" ||
          info.status.toLowerCase().includes("up"))
      );
    };

    if (op === "start") {
      const servicesToStart = new Set<string>();
      for (const p of selectedProcesses) {
        if (forceStart || !isPm2Online(p.name as string)) {
          servicesToStart.add(p.name as string);
        }
      }
      for (const [name] of selectedContainers) {
        if (forceStart || !isDockerRunning(name)) {
          servicesToStart.add(name);
        }
      }

      if (servicesToStart.size === 0) {
        return { waves: [] };
      }

      const waves = graph.computeStartWaves(servicesToStart);

      return { waves };
    }

    const servicesToStop = new Set<string>();
    for (const p of selectedProcesses) {
      if (hasPm2Process(p.name as string)) servicesToStop.add(p.name as string);
    }
    for (const [name] of selectedContainers) {
      if (isDockerRunning(name)) servicesToStop.add(name);
    }

    return { waves: this.buildStopWave(servicesToStop) };
  }
}
