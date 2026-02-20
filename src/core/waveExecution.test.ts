import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeActions } from "./executeActions";
import { Pm2Executor } from "./process/Pm2Executor";
import { DockerManager } from "./docker";
import { ActionPlan, Action } from "../types";
import { ZapperConfig } from "../utils";

vi.mock("./docker");
vi.mock("./findProcess");
vi.mock("./findContainer");
vi.mock("../config/stateLoader", () => ({
  updateServiceState: vi.fn(),
  clearServiceState: vi.fn(),
}));
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    setSink: vi.fn(),
  },
}));

vi.mock("./process/Pm2Executor", () => ({
  Pm2Executor: vi.fn(),
}));

describe("Wave Execution", () => {
  let mockConfig: ZapperConfig;
  let mockPm2Executor: {
    startProcess: ReturnType<typeof vi.fn>;
    stopProcess: ReturnType<typeof vi.fn>;
  };
  let executionOrder: string[];
  let executionTimestamps: Map<string, number>;

  beforeEach(async () => {
    vi.clearAllMocks();
    executionOrder = [];
    executionTimestamps = new Map();

    mockConfig = {
      project: "test-project",
      native: {
        "admin-app": { name: "admin-app", cmd: "npm start" },
        scribe: { name: "scribe", cmd: "npm start" },
        mongo: { name: "mongo", cmd: "npm start" },
        doctract: { name: "doctract", cmd: "npm start" },
      },
      docker: {},
    };

    mockPm2Executor = {
      startProcess: vi.fn().mockImplementation(async (process: { name: string }) => {
        executionOrder.push(`start:${process.name}`);
        executionTimestamps.set(`start:${process.name}`, Date.now());
        // Simulate some async work
        await new Promise((r) => setTimeout(r, 10));
      }),
      stopProcess: vi.fn().mockImplementation(async (name: string) => {
        executionOrder.push(`stop:${name}`);
        executionTimestamps.set(`stop:${name}`, Date.now());
        await new Promise((r) => setTimeout(r, 10));
      }),
    };

    vi.mocked(Pm2Executor).mockImplementation(() => mockPm2Executor as any);

    // Mock findProcess to return a process
    const { findProcess } = await import("./findProcess");
    vi.mocked(findProcess).mockImplementation((config: ZapperConfig, name: string) => {
      const process = config.native?.[name];
      if (process) return { ...process, name };
      return undefined;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Actions within a wave execute in parallel", () => {
    it("should execute all actions in a single wave concurrently", async () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              { type: "stop", serviceType: "native", name: "admin-app", healthcheck: 0 },
              { type: "stop", serviceType: "native", name: "scribe", healthcheck: 0 },
              { type: "stop", serviceType: "native", name: "mongo", healthcheck: 0 },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config", plan);

      // All three stops should have been called
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledTimes(3);
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledWith("admin-app");
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledWith("scribe");
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledWith("mongo");

      // Verify they executed concurrently by checking timestamps are close together
      const ts1 = executionTimestamps.get("stop:admin-app")!;
      const ts2 = executionTimestamps.get("stop:scribe")!;
      const ts3 = executionTimestamps.get("stop:mongo")!;

      // All should have started within 5ms of each other (parallel execution)
      expect(Math.abs(ts1 - ts2)).toBeLessThan(5);
      expect(Math.abs(ts2 - ts3)).toBeLessThan(5);
      expect(Math.abs(ts1 - ts3)).toBeLessThan(5);
    });

    it("should execute waves sequentially but actions within waves in parallel", async () => {
      const waveTimings: { wave: number; action: string; time: number }[] = [];

      mockPm2Executor.startProcess.mockImplementation(async (process: { name: string }) => {
        waveTimings.push({ wave: 1, action: `start:${process.name}`, time: Date.now() });
        await new Promise((r) => setTimeout(r, 20));
      });

      mockPm2Executor.stopProcess.mockImplementation(async (name: string) => {
        waveTimings.push({ wave: 2, action: `stop:${name}`, time: Date.now() });
        await new Promise((r) => setTimeout(r, 20));
      });

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              { type: "start", serviceType: "native", name: "admin-app", healthcheck: 0 },
              { type: "start", serviceType: "native", name: "scribe", healthcheck: 0 },
            ],
          },
          {
            actions: [
              { type: "stop", serviceType: "native", name: "mongo", healthcheck: 0 },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config", plan);

      // Wave 1 actions should start before wave 2
      const wave1Start = Math.min(
        ...waveTimings.filter((w) => w.wave === 1).map((w) => w.time),
      );
      const wave2Start = Math.min(
        ...waveTimings.filter((w) => w.wave === 2).map((w) => w.time),
      );

      expect(wave1Start).toBeLessThan(wave2Start);
    });
  });

  describe("Wave grouping for independent operations", () => {
    it("should group all independent stop actions into a single wave", async () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              { type: "stop", serviceType: "native", name: "admin-app", healthcheck: 0 },
              { type: "stop", serviceType: "native", name: "scribe", healthcheck: 0 },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config", plan);

      // Both stops should execute in parallel
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledTimes(2);

      const ts1 = executionTimestamps.get("stop:admin-app")!;
      const ts2 = executionTimestamps.get("stop:scribe")!;

      // Should be nearly simultaneous
      expect(Math.abs(ts1 - ts2)).toBeLessThan(10);
    });

    it("should group all independent start actions into a single wave", async () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              { type: "start", serviceType: "native", name: "admin-app", healthcheck: 0 },
              { type: "start", serviceType: "native", name: "scribe", healthcheck: 0 },
              { type: "start", serviceType: "native", name: "mongo", healthcheck: 0 },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config", plan);

      expect(mockPm2Executor.startProcess).toHaveBeenCalledTimes(3);

      const timestamps = [
        executionTimestamps.get("start:admin-app")!,
        executionTimestamps.get("start:scribe")!,
        executionTimestamps.get("start:mongo")!,
      ];

      // All should start within 10ms of each other
      const min = Math.min(...timestamps);
      const max = Math.max(...timestamps);
      expect(max - min).toBeLessThan(10);
    });
  });
});
