import { describe, it, expect, beforeEach } from "vitest";
import { DependencyGraph } from "./DependencyGraph";
import { Process, Container } from "../config/schemas";

describe("DependencyGraph Wave Generation", () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe("computeStartWaves", () => {
    it("should return actions sorted alphabetically within each wave", () => {
      const processes: Record<string, Process> = {
        zulu: { cmd: "npm start" },
        alpha: { cmd: "npm start" },
        mike: { cmd: "npm start" },
        bravo: { cmd: "npm start" },
      };

      for (const [name, proc] of Object.entries(processes)) {
        graph.addProcess(name, proc);
      }

      const servicesToStart = new Set(["zulu", "alpha", "mike", "bravo"]);
      const waves = graph.computeStartWaves(servicesToStart);

      expect(waves.length).toBe(1);
      const names = waves[0].actions.map((a) => a.name);
      expect(names).toEqual(["alpha", "bravo", "mike", "zulu"]);
    });

    it("should group independent services in the same wave", () => {
      graph.addProcess("api", { cmd: "npm start" });
      graph.addProcess("worker", { cmd: "npm start" });
      graph.addProcess("scheduler", { cmd: "npm start" });

      const waves = graph.computeStartWaves(
        new Set(["api", "worker", "scheduler"]),
      );

      expect(waves.length).toBe(1);
      expect(waves[0].actions.length).toBe(3);
    });

    it("should place dependencies in earlier waves", () => {
      graph.addContainer("database", { image: "postgres:15" });
      graph.addProcess("api", { cmd: "npm start", depends_on: ["database"] });
      graph.addProcess("frontend", { cmd: "npm start", depends_on: ["api"] });

      const waves = graph.computeStartWaves(
        new Set(["database", "api", "frontend"]),
      );

      expect(waves.length).toBe(3);

      // Wave 1: database (no deps)
      expect(waves[0].actions.map((a) => a.name)).toEqual(["database"]);

      // Wave 2: api (depends on database)
      expect(waves[1].actions.map((a) => a.name)).toEqual(["api"]);

      // Wave 3: frontend (depends on api)
      expect(waves[2].actions.map((a) => a.name)).toEqual(["frontend"]);
    });

    it("should place independent dependents in the same wave", () => {
      graph.addContainer("database", { image: "postgres:15" });
      graph.addContainer("redis", { image: "redis:7" });
      graph.addProcess("api", {
        cmd: "npm start",
        depends_on: ["database", "redis"],
      });

      const waves = graph.computeStartWaves(
        new Set(["database", "redis", "api"]),
      );

      expect(waves.length).toBe(2);

      // Wave 1: database and redis (both have no deps)
      const wave1Names = waves[0].actions.map((a) => a.name).sort();
      expect(wave1Names).toEqual(["database", "redis"]);

      // Wave 2: api (depends on both)
      expect(waves[1].actions.map((a) => a.name)).toEqual(["api"]);
    });

    it("should include healthcheck from process config", () => {
      graph.addProcess("api", { cmd: "npm start", healthcheck: 10 });

      const waves = graph.computeStartWaves(new Set(["api"]));

      expect(waves[0].actions[0].healthcheck).toBe(10);
    });

    it("should include healthcheck from container config", () => {
      graph.addContainer("database", { image: "postgres:15", healthcheck: 15 });

      const waves = graph.computeStartWaves(new Set(["database"]));

      expect(waves[0].actions[0].healthcheck).toBe(15);
    });

    it("should use default healthcheck of 5 when not specified", () => {
      graph.addProcess("api", { cmd: "npm start" });

      const waves = graph.computeStartWaves(new Set(["api"]));

      expect(waves[0].actions[0].healthcheck).toBe(5);
    });

    it("should throw on circular dependencies", () => {
      graph.addProcess("a", { cmd: "npm start", depends_on: ["b"] });
      graph.addProcess("b", { cmd: "npm start", depends_on: ["a"] });

      expect(() => graph.computeStartWaves(new Set(["a", "b"]))).toThrow(
        /Circular/,
      );
    });

    it("should throw on missing dependency", () => {
      graph.addProcess("api", {
        cmd: "npm start",
        depends_on: ["nonexistent"],
      });

      expect(() => graph.computeStartWaves(new Set(["api"]))).toThrow(
        /unknown service/,
      );
    });
  });

  describe("computeStopWaves", () => {
    it("should return actions sorted alphabetically within each wave", () => {
      const processes: Record<string, Process> = {
        zulu: { cmd: "npm start" },
        alpha: { cmd: "npm start" },
        mike: { cmd: "npm start" },
        bravo: { cmd: "npm start" },
      };

      for (const [name, proc] of Object.entries(processes)) {
        graph.addProcess(name, proc);
      }

      const waves = graph.computeStopWaves(
        new Set(["zulu", "alpha", "mike", "bravo"]),
      );

      expect(waves.length).toBe(1);
      const names = waves[0].actions.map((a) => a.name);
      expect(names).toEqual(["alpha", "bravo", "mike", "zulu"]);
    });

    it("should place dependents before dependencies", () => {
      graph.addContainer("database", { image: "postgres:15" });
      graph.addProcess("api", { cmd: "npm start", depends_on: ["database"] });
      graph.addProcess("frontend", { cmd: "npm start", depends_on: ["api"] });

      const waves = graph.computeStopWaves(
        new Set(["database", "api", "frontend"]),
      );

      expect(waves.length).toBe(3);

      // Stop order: frontend first, then api, then database
      expect(waves[0].actions.map((a) => a.name)).toEqual(["frontend"]);
      expect(waves[1].actions.map((a) => a.name)).toEqual(["api"]);
      expect(waves[2].actions.map((a) => a.name)).toEqual(["database"]);
    });

    it("should group independent dependents in the same wave", () => {
      // database has two dependents: api and worker
      // When stopping, both api and worker should stop before database
      graph.addContainer("database", { image: "postgres:15" });
      graph.addProcess("api", { cmd: "npm start", depends_on: ["database"] });
      graph.addProcess("worker", {
        cmd: "npm start",
        depends_on: ["database"],
      });

      const waves = graph.computeStopWaves(
        new Set(["database", "api", "worker"]),
      );

      expect(waves.length).toBe(2);

      // Wave 1: api and worker (both depend on database)
      const wave1Names = waves[0].actions.map((a) => a.name).sort();
      expect(wave1Names).toEqual(["api", "worker"]);

      // Wave 2: database
      expect(waves[1].actions.map((a) => a.name)).toEqual(["database"]);
    });
  });

  describe("Mixed services (native + docker)", () => {
    it("should handle both native and docker services in the same wave", () => {
      graph.addProcess("api", { cmd: "npm start" });
      graph.addContainer("redis", { image: "redis:7" });

      const waves = graph.computeStartWaves(new Set(["api", "redis"]));

      expect(waves.length).toBe(1);
      expect(waves[0].actions.length).toBe(2);

      const names = waves[0].actions.map((a) => a.name).sort();
      expect(names).toEqual(["api", "redis"]);
    });

    it("should correctly set serviceType for native and docker", () => {
      graph.addProcess("api", { cmd: "npm start" });
      graph.addContainer("redis", { image: "redis:7" });

      const waves = graph.computeStartWaves(new Set(["api", "redis"]));

      const apiAction = waves[0].actions.find((a) => a.name === "api");
      const redisAction = waves[0].actions.find((a) => a.name === "redis");

      expect(apiAction?.serviceType).toBe("native");
      expect(redisAction?.serviceType).toBe("docker");
    });
  });
});
