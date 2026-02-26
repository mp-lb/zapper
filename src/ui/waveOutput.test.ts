import { describe, it, expect, vi, beforeEach } from "vitest";
import { Action, ActionPlan, ExecutionWave } from "../types";

/**
 * This test file documents the expected output format for wave-based execution.
 *
 * Current output (undesired):
 *   Stopped admin-app
 *   Stopped scribe
 *   Starting mongo
 *   Starting doctract
 *   Starting scribe
 *   Starting admin-app
 *
 * Desired output (wave-based, alphabetically sorted):
 *   Stopped admin-app, scribe
 *   Starting admin-app, doctract, mongo, scribe
 */

/**
 * Formats a single wave's actions into a user-friendly message.
 * Groups actions by type and sorts alphabetically.
 */
function formatWaveOutput(wave: ExecutionWave): string[] {
  const lines: string[] = [];

  // Group actions by type
  const startActions = wave.actions
    .filter((a) => a.type === "start")
    .map((a) => a.name)
    .sort();

  const stopActions = wave.actions
    .filter((a) => a.type === "stop")
    .map((a) => a.name)
    .sort();

  if (stopActions.length > 0) {
    lines.push(`Stopped ${stopActions.join(", ")}`);
  }

  if (startActions.length > 0) {
    lines.push(`Starting ${startActions.join(", ")}`);
  }

  return lines;
}

/**
 * Formats all waves' actions into user-friendly messages.
 */
function formatPlanOutput(plan: ActionPlan): string[] {
  const lines: string[] = [];

  for (const wave of plan.waves) {
    lines.push(...formatWaveOutput(wave));
  }

  return lines;
}

describe("Wave Output Formatting", () => {
  describe("formatWaveOutput", () => {
    it("should format multiple stop actions as comma-separated list", () => {
      const wave: ExecutionWave = {
        actions: [
          {
            type: "stop",
            serviceType: "native",
            name: "admin-app",
            healthcheck: 0,
          },
          {
            type: "stop",
            serviceType: "native",
            name: "scribe",
            healthcheck: 0,
          },
          {
            type: "stop",
            serviceType: "native",
            name: "mongo",
            healthcheck: 0,
          },
        ],
      };

      const output = formatWaveOutput(wave);

      expect(output).toEqual(["Stopped admin-app, mongo, scribe"]);
    });

    it("should format multiple start actions as comma-separated list", () => {
      const wave: ExecutionWave = {
        actions: [
          {
            type: "start",
            serviceType: "native",
            name: "mongo",
            healthcheck: 0,
          },
          {
            type: "start",
            serviceType: "native",
            name: "doctract",
            healthcheck: 0,
          },
          {
            type: "start",
            serviceType: "native",
            name: "scribe",
            healthcheck: 0,
          },
          {
            type: "start",
            serviceType: "native",
            name: "admin-app",
            healthcheck: 0,
          },
        ],
      };

      const output = formatWaveOutput(wave);

      expect(output).toEqual(["Starting admin-app, doctract, mongo, scribe"]);
    });

    it("should sort action names alphabetically", () => {
      const wave: ExecutionWave = {
        actions: [
          { type: "stop", serviceType: "native", name: "zulu", healthcheck: 0 },
          {
            type: "stop",
            serviceType: "native",
            name: "alpha",
            healthcheck: 0,
          },
          { type: "stop", serviceType: "native", name: "mike", healthcheck: 0 },
          {
            type: "stop",
            serviceType: "native",
            name: "bravo",
            healthcheck: 0,
          },
        ],
      };

      const output = formatWaveOutput(wave);

      expect(output).toEqual(["Stopped alpha, bravo, mike, zulu"]);
    });

    it("should format single action without comma", () => {
      const wave: ExecutionWave = {
        actions: [
          {
            type: "stop",
            serviceType: "native",
            name: "admin-app",
            healthcheck: 0,
          },
        ],
      };

      const output = formatWaveOutput(wave);

      expect(output).toEqual(["Stopped admin-app"]);
    });

    it("should handle mixed start/stop actions in a wave", () => {
      const wave: ExecutionWave = {
        actions: [
          {
            type: "stop",
            serviceType: "native",
            name: "worker",
            healthcheck: 0,
          },
          { type: "start", serviceType: "native", name: "api", healthcheck: 0 },
          {
            type: "stop",
            serviceType: "native",
            name: "admin",
            healthcheck: 0,
          },
          {
            type: "start",
            serviceType: "native",
            name: "database",
            healthcheck: 0,
          },
        ],
      };

      const output = formatWaveOutput(wave);

      // Stops first, then starts
      expect(output).toEqual([
        "Stopped admin, worker",
        "Starting api, database",
      ]);
    });
  });

  describe("formatPlanOutput", () => {
    it("should format multiple waves separately", () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "stop",
                serviceType: "native",
                name: "admin-app",
                healthcheck: 0,
              },
              {
                type: "stop",
                serviceType: "native",
                name: "scribe",
                healthcheck: 0,
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "mongo",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "doctract",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "scribe",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "admin-app",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      const output = formatPlanOutput(plan);

      expect(output).toEqual([
        "Stopped admin-app, scribe",
        "Starting admin-app, doctract, mongo, scribe",
      ]);
    });

    it("should handle restart scenario", () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "stop",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
              {
                type: "stop",
                serviceType: "native",
                name: "worker",
                healthcheck: 0,
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "worker",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      const output = formatPlanOutput(plan);

      expect(output).toEqual(["Stopped api, worker", "Starting api, worker"]);
    });

    it("should handle dependency-ordered waves", () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "database",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "docker",
                name: "redis",
                healthcheck: 0,
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "frontend",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      const output = formatPlanOutput(plan);

      // Each wave gets its own line
      expect(output).toEqual([
        "Starting database, redis",
        "Starting api",
        "Starting frontend",
      ]);
    });

    it("should handle empty plan", () => {
      const plan: ActionPlan = { waves: [] };

      const output = formatPlanOutput(plan);

      expect(output).toEqual([]);
    });
  });

  describe("Real-world scenarios", () => {
    it("should match the example from the issue", () => {
      // The user's example:
      // Current: "Stopped admin-app\nStopped scribe\nStarting mongo\nStarting doctract\nStarting scribe\nStarting admin-app"
      // Desired: "Stopped admin-app, scribe\nStarting admin-app, doctract, mongo, scribe"

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "stop",
                serviceType: "native",
                name: "admin-app",
                healthcheck: 0,
              },
              {
                type: "stop",
                serviceType: "native",
                name: "scribe",
                healthcheck: 0,
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "mongo",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "doctract",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "scribe",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "admin-app",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      const output = formatPlanOutput(plan);

      expect(output).toEqual([
        "Stopped admin-app, scribe",
        "Starting admin-app, doctract, mongo, scribe",
      ]);
    });

    it("should handle mixed native and docker services", () => {
      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "postgres",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "docker",
                name: "redis",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "native",
                name: "worker",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      const output = formatWaveOutput(plan.waves[0]);

      // All start actions grouped, sorted alphabetically
      expect(output).toEqual(["Starting api, postgres, redis, worker"]);
    });
  });
});
