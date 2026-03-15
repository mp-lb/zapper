import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import {
  isolateProject,
  clearIsolation,
  resolveInstance,
  DEFAULT_INSTANCE_KEY,
} from "./instanceResolver";
import { loadState, saveState } from "../config/stateLoader";

describe("instanceResolver", () => {
  const testDir = path.join(__dirname, "../../test-fixtures/instance-resolver");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("throws when default instance is missing and autoCreate is false", async () => {
    await expect(resolveInstance(testDir)).rejects.toThrow(
      'Instance "default" not found.',
    );
  });

  it("creates default instance when autoCreate is true", async () => {
    const result = await resolveInstance(testDir, undefined, {
      autoCreate: true,
    });
    expect(result.instanceKey).toBe(DEFAULT_INSTANCE_KEY);
    expect(result.instanceId).toMatch(/^[a-z0-9]{6}$/);
  });

  it("creates and resolves isolate mode", async () => {
    const instanceId = isolateProject(testDir);
    const result = await resolveInstance(testDir, undefined, {
      autoCreate: true,
    });

    expect(instanceId).toMatch(/^[a-z0-9]{6}$/);
    expect(result.instanceKey).toBe(DEFAULT_INSTANCE_KEY);
    expect(result.instanceId).toBe(instanceId);
  });

  it("reuses existing instance id", () => {
    const first = isolateProject(testDir);
    const second = isolateProject(testDir);

    expect(second).toBe(first);
  });

  it("clears isolation", async () => {
    isolateProject(testDir);
    clearIsolation(testDir);

    const state = loadState(testDir);
    const result = await resolveInstance(testDir, undefined, {
      autoCreate: true,
    });

    expect(state.instanceId).toBeUndefined();
    expect(state.mode).toBeUndefined();
    expect(result.instanceKey).toBe(DEFAULT_INSTANCE_KEY);
    expect(result.instanceId).toMatch(/^[a-z0-9]{6}$/);
  });

  it("uses defaultInstance from state when --instance is omitted", async () => {
    saveState(testDir, {
      defaultInstance: "e-two",
      instances: {
        "e-two": { id: "abc123", ports: {} },
      },
    });

    const result = await resolveInstance(testDir);
    expect(result).toEqual({ instanceKey: "e-two", instanceId: "abc123" });
  });
});
