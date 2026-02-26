import { describe, it, expect } from "vitest";
import { DependencyGraph } from "./DependencyGraph";

describe("DependencyGraph", () => {
  describe("computeStartWaves", () => {
    it("should put independent services in the same wave", () => {
      const graph = new DependencyGraph();
      graph.addProcess("api", { cmd: "npm start", healthcheck: 5 });
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });

      const waves = graph.computeStartWaves(new Set(["api", "database"]));

      expect(waves.length).toBe(1);
      expect(waves[0].actions.length).toBe(2);
    });

    it("should order dependent services into separate waves", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["database"],
      });

      const waves = graph.computeStartWaves(new Set(["api", "database"]));

      expect(waves.length).toBe(2);
      expect(waves[0].actions[0].name).toBe("database");
      expect(waves[1].actions[0].name).toBe("api");
    });

    it("should handle complex dependency chains", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addContainer("redis", { image: "redis:7", healthcheck: 5 });
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["database", "redis"],
      });
      graph.addProcess("frontend", {
        cmd: "npm run dev",
        healthcheck: 5,
        depends_on: ["api"],
      });

      const waves = graph.computeStartWaves(
        new Set(["api", "database", "redis", "frontend"]),
      );

      expect(waves.length).toBe(3);
      const wave1Names = waves[0].actions.map((a) => a.name).sort();
      expect(wave1Names).toEqual(["database", "redis"]);
      expect(waves[1].actions[0].name).toBe("api");
      expect(waves[2].actions[0].name).toBe("frontend");
    });

    it("should detect circular dependencies", () => {
      const graph = new DependencyGraph();
      graph.addProcess("a", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["b"],
      });
      graph.addProcess("b", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["a"],
      });

      expect(() => graph.computeStartWaves(new Set(["a", "b"]))).toThrow(
        /[Cc]ircular/,
      );
    });

    it("should detect longer circular dependencies", () => {
      const graph = new DependencyGraph();
      graph.addProcess("a", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["b"],
      });
      graph.addProcess("b", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["c"],
      });
      graph.addProcess("c", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["a"],
      });

      expect(() => graph.computeStartWaves(new Set(["a", "b", "c"]))).toThrow(
        /[Cc]ircular/,
      );
    });

    it("should throw on unknown dependency", () => {
      const graph = new DependencyGraph();
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["unknown"],
      });

      expect(() => graph.computeStartWaves(new Set(["api"]))).toThrow(
        /unknown/,
      );
    });

    it("should only start requested services", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addProcess("api", { cmd: "npm start", healthcheck: 5 });
      graph.addProcess("worker", { cmd: "npm run worker", healthcheck: 5 });

      const waves = graph.computeStartWaves(new Set(["api"]));

      expect(waves.length).toBe(1);
      expect(waves[0].actions.length).toBe(1);
      expect(waves[0].actions[0].name).toBe("api");
    });

    it("should preserve healthcheck values", () => {
      const graph = new DependencyGraph();
      graph.addProcess("api", { cmd: "npm start", healthcheck: 15 });
      graph.addContainer("database", { image: "postgres:15", healthcheck: 30 });

      const waves = graph.computeStartWaves(new Set(["api", "database"]));
      const actions = waves.flatMap((w) => w.actions);

      expect(actions.find((a) => a.name === "api")?.healthcheck).toBe(15);
      expect(actions.find((a) => a.name === "database")?.healthcheck).toBe(30);
    });
  });

  describe("computeStopWaves", () => {
    it("should stop dependents before dependencies", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["database"],
      });

      const waves = graph.computeStopWaves(new Set(["api", "database"]));

      expect(waves.length).toBe(2);
      expect(waves[0].actions[0].name).toBe("api");
      expect(waves[1].actions[0].name).toBe("database");
    });

    it("should stop all dependents before the dependency", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["database"],
      });
      graph.addProcess("worker", {
        cmd: "npm run worker",
        healthcheck: 5,
        depends_on: ["database"],
      });

      const waves = graph.computeStopWaves(
        new Set(["api", "worker", "database"]),
      );

      expect(waves.length).toBe(2);
      const wave1Names = waves[0].actions.map((a) => a.name).sort();
      expect(wave1Names).toEqual(["api", "worker"]);
      expect(waves[1].actions[0].name).toBe("database");
    });

    it("should handle complex stop order", () => {
      const graph = new DependencyGraph();
      graph.addContainer("database", { image: "postgres:15", healthcheck: 5 });
      graph.addProcess("api", {
        cmd: "npm start",
        healthcheck: 5,
        depends_on: ["database"],
      });
      graph.addProcess("frontend", {
        cmd: "npm run dev",
        healthcheck: 5,
        depends_on: ["api"],
      });

      const waves = graph.computeStopWaves(
        new Set(["frontend", "api", "database"]),
      );

      expect(waves.length).toBe(3);
      expect(waves[0].actions[0].name).toBe("frontend");
      expect(waves[1].actions[0].name).toBe("api");
      expect(waves[2].actions[0].name).toBe("database");
    });
  });
});
