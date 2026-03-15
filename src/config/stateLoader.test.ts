import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadState,
  saveState,
  updateServiceState,
  clearServiceState,
} from "./stateLoader";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
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
        activeProfile: "dev",
        activeInstance: "default",
        services: { "zap.demo.default.api": { startPid: 1234 } },
      }),
    );

    const state = loadState(testDir);
    expect(state.activeProfile).toBe("dev");
    expect((state as Record<string, unknown>).activeInstance).toBeUndefined();
    expect((state as Record<string, unknown>).services).toBeUndefined();
  });

  it("merges top-level properties and updates timestamp", () => {
    saveState(testDir, { activeProfile: "dev" });

    saveState(testDir, { activeEnvironment: "staging" });
    const state = loadState(testDir);

    expect(state.activeProfile).toBe("dev");
    expect(state.activeEnvironment).toBe("staging");
    expect(state.lastUpdated).toBeDefined();
    expect(state.lastUpdated).toBeTruthy();
  });

  it("does not persist service lifecycle state", () => {
    updateServiceState(testDir, "zap.demo.default.api", { startPid: 100 });
    clearServiceState(testDir, "zap.demo.default.api");
    const state = loadState(testDir);
    expect((state as Record<string, unknown>).services).toBeUndefined();
  });
});
