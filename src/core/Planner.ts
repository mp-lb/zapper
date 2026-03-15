import { ZapperConfig, Process, Container } from "../config/schemas";
import { Pm2Manager } from "./process/Pm2Manager";
import { DockerManager } from "./docker";
import { ActionPlan, ExecutionWave, Action } from "../types";
import { DependencyGraph } from "./DependencyGraph";
import { buildServiceName } from "../utils/nameBuilder";

export class Planner {
  constructor(private readonly config: ZapperConfig) {}

  private shouldRunWithProfile(
    serviceProfiles: string[] | undefined,
    activeProfile?: string,
  ): boolean {
    if (!Array.isArray(serviceProfiles) || serviceProfiles.length === 0) {
      return true;
    }
    if (!activeProfile) return false;
    return serviceProfiles.includes(activeProfile);
  }

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
      healthcheck: 0,
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

  private filterByProfile(
    processes: Process[],
    containers: Array<[string, Container]>,
    activeProfile?: string,
  ): { processes: Process[]; containers: Array<[string, Container]> } {
    return {
      processes: processes.filter((p) =>
        this.shouldRunWithProfile(p.profiles, activeProfile),
      ),
      containers: containers.filter(([, c]) =>
        this.shouldRunWithProfile(c.profiles, activeProfile),
      ),
    };
  }

  async plan(
    op: "start" | "stop" | "restart",
    targets: string[] | undefined,
    projectName: string,
    forceStart = false,
    activeProfile?: string,
    resolveTargetDependencies = true,
  ): Promise<ActionPlan> {
    if (op === "restart") {
      const filteredServices = this.filterByProfile(
        this.getProcesses(),
        this.getContainers(),
        activeProfile,
      );
      const selectedTargets =
        targets && targets.length > 0
          ? targets
          : [
              ...filteredServices.processes.map((p) => p.name as string),
              ...filteredServices.containers.map(([name]) => name),
            ];

      const stopPlan = await this.plan("stop", selectedTargets, projectName);
      const startPlan = await this.plan(
        "start",
        selectedTargets,
        projectName,
        true,
        undefined,
        false,
      );

      return { waves: [...stopPlan.waves, ...startPlan.waves] };
    }

    const graph = this.buildGraph();
    const allProcesses = this.getProcesses();
    const allContainers = this.getContainers();

    const pm2List = await Pm2Manager.listProcesses();
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

    const isDockerRunning = async (name: string): Promise<boolean> => {
      const info = await DockerManager.getContainerInfo(
        buildServiceName(projectName, name, instanceId),
      );
      return (
        !!info &&
        (info.status.toLowerCase() === "running" ||
          info.status.toLowerCase().includes("up"))
      );
    };

    if (op === "start") {
      let selectedProcesses: Process[];
      let selectedContainers: Array<[string, Container]>;

      if (targets && targets.length > 0) {
        if (resolveTargetDependencies) {
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
        const filtered = this.filterByProfile(
          allProcesses,
          allContainers,
          activeProfile,
        );
        selectedProcesses = filtered.processes;
        selectedContainers = filtered.containers;
      }

      const servicesToStart = new Set<string>();
      for (const p of selectedProcesses) {
        if (forceStart || !isPm2Online(p.name as string)) {
          servicesToStart.add(p.name as string);
        }
      }
      for (const [name] of selectedContainers) {
        if (forceStart || !(await isDockerRunning(name))) {
          servicesToStart.add(name);
        }
      }

      let stopWaves: ExecutionWave[] = [];
      if (!targets) {
        stopWaves = await this.planProfileStops(
          projectName,
          activeProfile,
          allProcesses,
          allContainers,
          hasPm2Process,
          isDockerRunning,
        );
      }

      if (servicesToStart.size === 0) {
        return { waves: stopWaves };
      }

      const waves = graph.computeStartWaves(servicesToStart);

      if (!targets) {
        return { waves: [...stopWaves, ...waves] };
      }

      return { waves };
    }

    let selectedProcesses: Process[];
    let selectedContainers: Array<[string, Container]>;

    if (targets && targets.length > 0) {
      selectedProcesses = allProcesses.filter((p) =>
        targets.includes(p.name as string),
      );
      selectedContainers = allContainers.filter(([name]) =>
        targets.includes(name),
      );
    } else {
      selectedProcesses = allProcesses;
      selectedContainers = allContainers;
    }

    const servicesToStop = new Set<string>();
    for (const p of selectedProcesses) {
      if (hasPm2Process(p.name as string)) servicesToStop.add(p.name as string);
    }
    for (const [name] of selectedContainers) {
      if (await isDockerRunning(name)) servicesToStop.add(name);
    }

    return { waves: this.buildStopWave(servicesToStop) };
  }

  private async planProfileStops(
    projectName: string,
    activeProfile: string | undefined,
    allProcesses: Process[],
    allContainers: Array<[string, Container]>,
    hasPm2Process: (name: string) => boolean,
    isDockerRunning: (name: string) => Promise<boolean>,
  ): Promise<ExecutionWave[]> {
    // Collect services that need to be stopped (not in active profile but currently running)
    const servicesToStop = new Set<string>();

    // Find services that should be stopped (not in active profile but running)
    for (const process of allProcesses) {
      const shouldRun = this.shouldRunWithProfile(
        process.profiles,
        activeProfile,
      );

      if (!shouldRun && hasPm2Process(process.name as string)) {
        servicesToStop.add(process.name as string);
      }
    }

    for (const [name, container] of allContainers) {
      const shouldRun = this.shouldRunWithProfile(
        container.profiles,
        activeProfile,
      );

      if (!shouldRun && (await isDockerRunning(name))) {
        servicesToStop.add(name);
      }
    }

    // Use DependencyGraph to compute stop waves with proper dependency ordering
    if (servicesToStop.size === 0) {
      return [];
    }

    return this.buildStopWave(servicesToStop);
  }
}
