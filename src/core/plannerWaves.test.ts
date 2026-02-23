import { describe, it, expect, vi, beforeEach } from "vitest";
import { Planner } from "./Planner";
import { Pm2Manager } from "./process/Pm2Manager";
import { DockerManager } from "./docker";
import { ZapperConfig } from "../config/schemas";
import { ProcessInfo } from "../types/index";
import { ActionPlan, Action } from "../types";

vi.mock("./process/Pm2Manager");
vi.mock("./docker");

const mockPm2Manager = vi.mocked(Pm2Manager);
const mockDockerManager = vi.mocked(DockerManager);

function createMockProcessInfo(name: string, status: string): ProcessInfo {
  return {
    name,
    status,
    pid: status === "online" ? 1234 : 0,
    uptime: status === "online" ? 1000 : 0,
    memory: status === "online" ? 100 : 0,
    cpu: status === "online" ? 5 : 0,
    restarts: 0,
  };
}

function createMockDockerContainer(name: string, status: string) {
  return {
    id: "abc123",
    name,
    status,
    ports: [],
    networks: [],
    created: "2023-01-01",
  };
}

/**
 * Helper to get sorted names from a wave's actions.
 * Actions should be sorted alphabetically for consistent output.
 */
function getSortedNamesFromWave(actions: Action[]): string[] {
  return actions.map((a) => a.name).sort();
}

/**
 * Helper to check if all actions in a wave are of the same type.
 */
function getActionTypes(wave: { actions: Action[] }): Set<string> {
  return new Set(wave.actions.map((a) => a.type));
}

/**
 * Helper to flatten all action names in order they appear.
 */
function flattenActionNames(plan: ActionPlan): string[] {
  return plan.waves.flatMap((w) => w.actions.map((a) => a.name));
}

describe("Planner Wave Generation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPm2Manager.listProcesses.mockResolvedValue([]);
    mockDockerManager.getContainerInfo.mockResolvedValue(null);
  });

  describe("Independent stops should be grouped into a single wave", () => {
    it("should group multiple independent stop actions into a single wave", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          "admin-app": { cmd: "npm start" },
          scribe: { cmd: "npm start" },
          mongo: { cmd: "npm start" },
          doctract: { cmd: "npm start" },
        },
        docker: {},
      };

      // Simulate all services running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.admin-app", "online"),
        createMockProcessInfo("zap.test-project.scribe", "online"),
        createMockProcessInfo("zap.test-project.mongo", "online"),
        createMockProcessInfo("zap.test-project.doctract", "online"),
      ]);

      const planner = new Planner(config);
      const plan = await planner.plan("stop", undefined, "test-project");

      // All stops are independent, should be in a single wave
      expect(plan.waves.length).toBe(1);
      expect(plan.waves[0].actions.length).toBe(4);

      // Actions should be sorted alphabetically
      const sortedNames = getSortedNamesFromWave(plan.waves[0].actions);
      expect(sortedNames).toEqual(["admin-app", "doctract", "mongo", "scribe"]);

      // All actions should be stop actions
      const actionTypes = getActionTypes(plan.waves[0]);
      expect(actionTypes).toEqual(new Set(["stop"]));
    });

    it("should group independent native and docker stops into the same wave", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" },
          worker: { cmd: "npm start" },
        },
        docker: {
          redis: { image: "redis:7" },
          postgres: { image: "postgres:15" },
        },
      };

      // Simulate all services running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "online"),
        createMockProcessInfo("zap.test-project.worker", "online"),
      ]);
      mockDockerManager.getContainerInfo.mockResolvedValue(
        createMockDockerContainer("zap.test-project.redis", "running"),
      );

      const planner = new Planner(config);
      const plan = await planner.plan("stop", undefined, "test-project");

      // All independent stops should be in minimal waves based on dependencies
      // Since there are no dependencies, they should all be in wave 1
      expect(plan.waves.length).toBe(1);
      expect(plan.waves[0].actions.length).toBe(4);

      const names = getSortedNamesFromWave(plan.waves[0].actions);
      expect(names).toEqual(["api", "postgres", "redis", "worker"]);
    });
  });

  describe("Independent starts should be grouped into a single wave", () => {
    it("should group multiple independent start actions into a single wave", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          "admin-app": { cmd: "npm start" },
          scribe: { cmd: "npm start" },
          mongo: { cmd: "npm start" },
          doctract: { cmd: "npm start" },
        },
        docker: {},
      };

      const planner = new Planner(config);
      const plan = await planner.plan("start", undefined, "test-project", true);

      // All starts are independent, should be in a single wave
      expect(plan.waves.length).toBe(1);
      expect(plan.waves[0].actions.length).toBe(4);

      // Actions should be sorted alphabetically
      const sortedNames = getSortedNamesFromWave(plan.waves[0].actions);
      expect(sortedNames).toEqual(["admin-app", "doctract", "mongo", "scribe"]);

      // All actions should be start actions
      const actionTypes = getActionTypes(plan.waves[0]);
      expect(actionTypes).toEqual(new Set(["start"]));
    });

    it("should group independent native and docker starts into the same wave", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" },
          worker: { cmd: "npm start" },
        },
        docker: {
          redis: { image: "redis:7" },
          postgres: { image: "postgres:15" },
        },
      };

      const planner = new Planner(config);
      const plan = await planner.plan("start", undefined, "test-project", true);

      expect(plan.waves.length).toBe(1);
      expect(plan.waves[0].actions.length).toBe(4);

      const names = getSortedNamesFromWave(plan.waves[0].actions);
      expect(names).toEqual(["api", "postgres", "redis", "worker"]);
    });
  });

  describe("Dependent services should be in separate waves", () => {
    it("should place dependents after their dependencies for start", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start", depends_on: ["database"] },
          frontend: { cmd: "npm start", depends_on: ["api"] },
        },
        docker: {
          database: { image: "postgres:15" },
        },
      };

      const planner = new Planner(config);
      const plan = await planner.plan("start", undefined, "test-project", true);

      // Should have 3 waves: database, api, frontend
      expect(plan.waves.length).toBe(3);

      expect(plan.waves[0].actions.map((a) => a.name)).toContain("database");
      expect(plan.waves[1].actions.map((a) => a.name)).toContain("api");
      expect(plan.waves[2].actions.map((a) => a.name)).toContain("frontend");
    });

    it("should place dependencies after their dependents for stop", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start", depends_on: ["database"] },
          frontend: { cmd: "npm start", depends_on: ["api"] },
        },
        docker: {
          database: { image: "postgres:15" },
        },
      };

      // Simulate all running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "online"),
        createMockProcessInfo("zap.test-project.frontend", "online"),
      ]);
      mockDockerManager.getContainerInfo.mockResolvedValue(
        createMockDockerContainer("zap.test-project.database", "running"),
      );

      const planner = new Planner(config);
      const plan = await planner.plan("stop", undefined, "test-project");

      // Stop order should be reverse: frontend, api, database
      expect(plan.waves.length).toBe(3);

      expect(plan.waves[0].actions.map((a) => a.name)).toContain("frontend");
      expect(plan.waves[1].actions.map((a) => a.name)).toContain("api");
      expect(plan.waves[2].actions.map((a) => a.name)).toContain("database");
    });
  });

  describe("Profile-based stops should be grouped efficiently", () => {
    it("should group all profile-based stop actions into a single wave when independent", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" }, // no profile
          "admin-app": { cmd: "npm start", profiles: ["admin"] },
          scribe: { cmd: "npm start", profiles: ["scribe"] },
          worker: { cmd: "npm start", profiles: ["worker"] },
        },
        docker: {},
      };

      // Simulate all running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "stopped"),
        createMockProcessInfo("zap.test-project.admin-app", "online"),
        createMockProcessInfo("zap.test-project.scribe", "online"),
        createMockProcessInfo("zap.test-project.worker", "online"),
      ]);

      const planner = new Planner(config);
      // Start without profile - should stop all profiled services
      const plan = await planner.plan(
        "start",
        undefined,
        "test-project",
        false,
      );

      // Find all stop actions
      const stopWaves = plan.waves.filter((w) =>
        w.actions.some((a) => a.type === "stop"),
      );

      // All stops should be in a single wave since they're independent
      expect(stopWaves.length).toBe(1);
      expect(stopWaves[0].actions.length).toBe(3);

      const stopNames = getSortedNamesFromWave(stopWaves[0].actions);
      expect(stopNames).toEqual(["admin-app", "scribe", "worker"]);
    });

    it("should group profile stops with dependency-based waves correctly", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start", depends_on: ["database"] }, // no profile
          admin: { cmd: "npm start", profiles: ["admin"] }, // admin only
        },
        docker: {
          database: { image: "postgres:15" }, // no profile
        },
      };

      // Simulate: api stopped, admin running, database running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "stopped"),
        createMockProcessInfo("zap.test-project.admin", "online"),
      ]);
      mockDockerManager.getContainerInfo.mockResolvedValue(
        createMockDockerContainer("zap.test-project.database", "running"),
      );

      const planner = new Planner(config);
      const plan = await planner.plan(
        "start",
        undefined,
        "test-project",
        false,
      );

      // Should have: wave 1 (stop admin), wave 2 (start api)
      // Note: database is already running, so it won't be started
      // api depends on database, but database doesn't need to be started

      const stopActions = plan.waves.flatMap((w) =>
        w.actions.filter((a) => a.type === "stop"),
      );
      const startActions = plan.waves.flatMap((w) =>
        w.actions.filter((a) => a.type === "start"),
      );

      expect(stopActions.length).toBe(1);
      expect(stopActions[0].name).toBe("admin");

      // Only api needs to be started (database is already running)
      expect(startActions.length).toBe(1);
      expect(startActions[0].name).toBe("api");
    });
  });

  describe("Mixed operations should be grouped efficiently", () => {
    it("should handle restart with proper wave grouping", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" },
          worker: { cmd: "npm start" },
        },
        docker: {},
      };

      // Simulate all running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "online"),
        createMockProcessInfo("zap.test-project.worker", "online"),
      ]);

      const planner = new Planner(config);
      const plan = await planner.plan("restart", undefined, "test-project");

      // Should have 2 waves: wave 1 (stop both), wave 2 (start both)
      expect(plan.waves.length).toBe(2);

      // Wave 1: stop both
      expect(plan.waves[0].actions.length).toBe(2);
      expect(getActionTypes(plan.waves[0])).toEqual(new Set(["stop"]));
      const stopNames = getSortedNamesFromWave(plan.waves[0].actions);
      expect(stopNames).toEqual(["api", "worker"]);

      // Wave 2: start both
      expect(plan.waves[1].actions.length).toBe(2);
      expect(getActionTypes(plan.waves[1])).toEqual(new Set(["start"]));
      const startNames = getSortedNamesFromWave(plan.waves[1].actions);
      expect(startNames).toEqual(["api", "worker"]);
    });
  });

  describe("Empty and edge cases", () => {
    it("should return empty waves when nothing to do", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" },
        },
        docker: {},
      };

      // Already running
      mockPm2Manager.listProcesses.mockResolvedValue([
        createMockProcessInfo("zap.test-project.api", "online"),
      ]);

      const planner = new Planner(config);
      const plan = await planner.plan(
        "start",
        undefined,
        "test-project",
        false,
      );

      expect(plan.waves.length).toBe(0);
    });

    it("should handle single service", async () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm start" },
        },
        docker: {},
      };

      const planner = new Planner(config);
      const plan = await planner.plan("start", undefined, "test-project", true);

      expect(plan.waves.length).toBe(1);
      expect(plan.waves[0].actions.length).toBe(1);
      expect(plan.waves[0].actions[0].name).toBe("api");
    });
  });
});

describe("Wave output formatting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPm2Manager.listProcesses.mockResolvedValue([]);
    mockDockerManager.getContainerInfo.mockResolvedValue(null);
  });

  it("should produce alphabetically sorted action names within each wave", async () => {
    const config: ZapperConfig = {
      project: "test-project",
      native: {
        zulu: { cmd: "npm start" },
        alpha: { cmd: "npm start" },
        mike: { cmd: "npm start" },
        bravo: { cmd: "npm start" },
      },
      docker: {},
    };

    const planner = new Planner(config);
    const plan = await planner.plan("start", undefined, "test-project", true);

    const names = plan.waves[0].actions.map((a) => a.name);
    expect(names).toEqual(["alpha", "bravo", "mike", "zulu"]);
  });
});
