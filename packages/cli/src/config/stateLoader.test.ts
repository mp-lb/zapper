import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadState,
  saveState,
  updateState,
  updateServiceState,
  clearServiceState,
} from "./stateLoader";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";

vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    setSink: vi.fn(),
  },
}));

describe("stateLoader", () => {
  let testDir: string;
  let testCounter = 0;

  beforeEach(() => {
    testCounter++;
    testDir = path.join(
      tmpdir(),
      `zapper-state-test-${Date.now()}-${testCounter}`,
    );

    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  it("returns default state when file doesn't exist", () => {
    const state = loadState(testDir);
    expect(state).toEqual({ lastUpdated: expect.any(String) });
  });

  it("loads valid state and drops unknown fields", () => {
    const zapDir = path.join(testDir, ".zap");
    const statePath = path.join(zapDir, "state.json");
    mkdirSync(zapDir);

    writeFileSync(
      statePath,
      JSON.stringify({
        selectedProfile: "dev",
        activeInstance: "default",
        services: { "zap.demo.default.api": { startPid: 1234 } },
      }),
    );

    const state = loadState(testDir);
    expect(state.selectedProfile).toBe("dev");
    expect((state as Record<string, unknown>).activeInstance).toBeUndefined();
    expect((state as Record<string, unknown>).services).toBeUndefined();
  });

  it("merges top-level properties and updates timestamp", () => {
    saveState(testDir, { selectedProfile: "dev" });

    saveState(testDir, {
      stacks: {
        dev: {
          stackId: "abc123",
          profile: "dev",
        },
      },
    });

    const state = loadState(testDir);

    expect(state.selectedProfile).toBe("dev");
    expect(state.stacks?.dev?.stackId).toBe("abc123");
    expect(state.lastUpdated).toBeDefined();
    expect(state.lastUpdated).toBeTruthy();
  });

  it("loads new profile stack state", () => {
    const zapDir = path.join(testDir, ".zap");
    const statePath = path.join(zapDir, "state.json");
    mkdirSync(zapDir);

    writeFileSync(
      statePath,
      JSON.stringify({
        selectedProfile: "e2e",
        stacks: {
          default: {
            stackId: "abc123",
            profile: "default",
            ports: { API_PORT: "54321" },
          },
          e2e: {
            stackId: "def456",
            profile: "e2e",
            volumes: {
              "zap.demo.def456.vol1": {
                service: "db",
                internal_dir: "/var/lib/postgresql/data",
              },
            },
          },
        },
      }),
    );

    const state = loadState(testDir);
    expect(state.selectedProfile).toBe("e2e");
    expect(state.stacks?.default?.stackId).toBe("abc123");
    expect(state.stacks?.default?.ports).toEqual({ API_PORT: "54321" });
    expect(state.stacks?.e2e?.volumes).toEqual({
      "zap.demo.def456.vol1": {
        service: "db",
        internal_dir: "/var/lib/postgresql/data",
      },
    });
  });

  it("updates new stack state while preserving sibling stacks", () => {
    updateState(testDir, () => ({
      selectedProfile: "default",
      stacks: {
        default: {
          stackId: "abc123",
          profile: "default",
          ports: { API_PORT: "5000" },
        },
      },
    }));

    updateState(testDir, (state) => ({
      selectedProfile: "e2e",
      stacks: {
        ...(state.stacks || {}),
        e2e: {
          stackId: "def456",
          profile: "e2e",
          ports: { API_PORT: "6000" },
        },
      },
    }));

    const state = loadState(testDir);
    expect(state.selectedProfile).toBe("e2e");
    expect(state.stacks?.default?.ports).toEqual({ API_PORT: "5000" });
    expect(state.stacks?.e2e?.ports).toEqual({ API_PORT: "6000" });
  });

  it("updates state from the latest file contents while holding the state lock", () => {
    updateState(testDir, () => ({
      instances: {
        default: {
          id: "abc123",
          ports: { API_PORT: "5000" },
        },
      },
    }));

    updateState(testDir, (state) => ({
      instances: {
        ...(state.instances || {}),
        default: {
          ...state.instances?.default,
          id: state.instances?.default?.id || "missing",
          volumes: {
            "zap.demo.abc123.vol1": {
              service: "db",
              internal_dir: "/var/lib/postgresql/data",
            },
          },
        },
      },
    }));

    const state = loadState(testDir);
    expect(state.instances?.default?.ports).toEqual({ API_PORT: "5000" });
    expect(state.instances?.default?.volumes).toEqual({
      "zap.demo.abc123.vol1": {
        service: "db",
        internal_dir: "/var/lib/postgresql/data",
      },
    });
  });

  it("does not replace corrupt state with defaults on a write path", () => {
    const zapDir = path.join(testDir, ".zap");
    const statePath = path.join(zapDir, "state.json");
    mkdirSync(zapDir);
    writeFileSync(statePath, "{ invalid json");

    expect(() => saveState(testDir, { selectedProfile: "dev" })).toThrow();
    expect(readFileSync(statePath, "utf8")).toBe("{ invalid json");
  });

  it("does not persist service lifecycle state", () => {
    updateServiceState(testDir, "zap.demo.default.api", { startPid: 100 });
    clearServiceState(testDir, "zap.demo.default.api");
    const state = loadState(testDir);
    expect((state as Record<string, unknown>).services).toBeUndefined();
  });
});
