import { Process, Container } from "../config/schemas";
import { Action, ExecutionWave, ServiceType } from "../types";

interface ServiceNode {
  name: string;
  serviceType: ServiceType;
  healthcheck: number | string;
  depends_on: string[];
}

export class DependencyGraph {
  private nodes: Map<string, ServiceNode> = new Map();
  private edges: Map<string, Set<string>> = new Map();

  addProcess(name: string, process: Process): void {
    this.nodes.set(name, {
      name,
      serviceType: "native",
      healthcheck: process.healthcheck ?? 5,
      depends_on: process.depends_on ?? [],
    });
  }

  addContainer(name: string, container: Container): void {
    this.nodes.set(name, {
      name,
      serviceType: "docker",
      healthcheck: container.healthcheck ?? 5,
      depends_on: container.depends_on ?? [],
    });
  }

  private buildEdges(): void {
    this.edges.clear();
    for (const [name, node] of this.nodes) {
      this.edges.set(name, new Set());
      for (const dep of node.depends_on) {
        if (!this.nodes.has(dep))
          throw new Error(
            `Service "${name}" depends on unknown service "${dep}"`,
          );
        this.edges.get(name)!.add(dep);
      }
    }
  }

  private detectCycle(): string[] | null {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const dep of this.edges.get(node) || []) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (recStack.has(dep)) {
          path.push(dep);
          return true;
        }
      }

      path.pop();
      recStack.delete(node);
      return false;
    };

    for (const node of this.nodes.keys()) {
      if (!visited.has(node) && dfs(node)) {
        const cycleStart = path[path.length - 1];
        const cycleStartIdx = path.indexOf(cycleStart);
        return path.slice(cycleStartIdx);
      }
    }

    return null;
  }

  computeStartWaves(servicesToStart: Set<string>): ExecutionWave[] {
    this.buildEdges();

    const cycle = this.detectCycle();
    if (cycle)
      throw new Error(`Circular dependency detected: ${cycle.join(" -> ")}`);

    const waves: ExecutionWave[] = [];
    const started = new Set<string>();
    const remaining = new Set(servicesToStart);

    while (remaining.size > 0) {
      const wave: Action[] = [];

      for (const name of remaining) {
        const node = this.nodes.get(name);
        if (!node) continue;

        const depsReady = node.depends_on.every(
          (dep) => started.has(dep) || !servicesToStart.has(dep),
        );

        if (depsReady) {
          wave.push({
            type: "start",
            serviceType: node.serviceType,
            name: node.name,
            healthcheck: node.healthcheck,
          });
        }
      }

      if (wave.length === 0 && remaining.size > 0)
        throw new Error(
          "Unable to resolve dependencies - possible missing service",
        );

      for (const action of wave) {
        started.add(action.name);
        remaining.delete(action.name);
      }

      if (wave.length > 0) {
        // Sort actions alphabetically by name within each wave
        wave.sort((a, b) => a.name.localeCompare(b.name));
        waves.push({ actions: wave });
      }
    }

    return waves;
  }

  computeStopWaves(servicesToStop: Set<string>): ExecutionWave[] {
    this.buildEdges();

    const waves: ExecutionWave[] = [];
    const stopped = new Set<string>();
    const remaining = new Set(servicesToStop);

    const reverseDeps = new Map<string, Set<string>>();
    for (const name of this.nodes.keys()) {
      reverseDeps.set(name, new Set());
    }
    for (const [name, node] of this.nodes) {
      for (const dep of node.depends_on) {
        reverseDeps.get(dep)?.add(name);
      }
    }

    while (remaining.size > 0) {
      const wave: Action[] = [];

      for (const name of remaining) {
        const node = this.nodes.get(name);
        if (!node) continue;

        const dependentsReady = [...(reverseDeps.get(name) || [])].every(
          (dependent) =>
            stopped.has(dependent) || !servicesToStop.has(dependent),
        );

        if (dependentsReady) {
          wave.push({
            type: "stop",
            serviceType: node.serviceType,
            name: node.name,
            healthcheck: node.healthcheck,
          });
        }
      }

      if (wave.length === 0 && remaining.size > 0)
        throw new Error("Unable to resolve stop order");

      for (const action of wave) {
        stopped.add(action.name);
        remaining.delete(action.name);
      }

      if (wave.length > 0) {
        // Sort actions alphabetically by name within each wave
        wave.sort((a, b) => a.name.localeCompare(b.name));
        waves.push({ actions: wave });
      }
    }

    return waves;
  }
}
