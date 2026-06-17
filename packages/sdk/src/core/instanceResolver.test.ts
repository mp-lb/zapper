import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import path from "path";
import {
  isolateProject,
  clearIsolation,
  resolveInstance,
  DEFAULT_INSTANCE_KEY,
  getInstanceDisplayLabel,
  setInstanceLabel,
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

  it("creates and resolves the default instance", async () => {
    const instanceId = isolateProject(testDir);

    const result = await resolveInstance(testDir, undefined, {
      autoCreate: true,
    });

    expect(instanceId).toMatch(/^[a-z0-9]{6}$/);
    expect(result.instanceKey).toBe(DEFAULT_INSTANCE_KEY);
    expect(result.instanceId).toBe(instanceId);
  });

  it("migrates legacy top-level ports into the default instance without rewriting them at the top level", () => {
    mkdirSync(path.join(testDir, ".zap"), { recursive: true });
    writeFileSync(
      path.join(testDir, ".zap", "state.json"),
      JSON.stringify({ ports: { API_PORT: "54321" } }),
    );

    isolateProject(testDir);

    const state = loadState(testDir);
    expect(state.instances?.default?.ports).toEqual({ API_PORT: "54321" });
    expect(state.ports).toBeUndefined();
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
    expect(result).toEqual({
      instanceKey: "e-two",
      instanceId: "abc123",
      label: undefined,
    });
  });

  it("allows digit-bearing keys for profile-owned stacks", async () => {
    const result = await resolveInstance(testDir, "e2e", {
      autoCreate: true,
    });

    expect(result.instanceKey).toBe("e2e");
    expect(result.instanceId).toMatch(/^[a-z0-9]{6}$/);
  });

  it("sets and resolves an instance label", async () => {
    const result = setInstanceLabel(testDir, "default", "local checkout");
    const state = loadState(testDir);
    const resolved = await resolveInstance(testDir);

    expect(result).toEqual({
      instanceKey: "default",
      instanceId: state.instances?.default.id,
      label: "local checkout",
    });

    expect(resolved.label).toBe("local checkout");
    expect(getInstanceDisplayLabel(state.instances!.default)).toBe(
      "local checkout",
    );
  });

  it("rejects labels longer than 100 characters", () => {
    expect(() => setInstanceLabel(testDir, "default", "x".repeat(101))).toThrow(
      "Instance label cannot exceed 100 characters.",
    );
  });
});
