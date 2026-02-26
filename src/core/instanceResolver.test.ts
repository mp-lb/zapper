import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { isolateProject, clearIsolation, resolveInstance } from "./instanceResolver";
import { loadState } from "../config/stateLoader";

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

  it("returns normal mode when no instance exists", async () => {
    const result = await resolveInstance(testDir);
    expect(result).toEqual({ mode: "normal" });
  });

  it("creates and resolves isolate mode", async () => {
    const instanceId = isolateProject(testDir);
    const result = await resolveInstance(testDir);

    expect(instanceId).toMatch(/^[a-z0-9]{6}$/);
    expect(result).toEqual({
      mode: "isolate",
      instanceId,
    });
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
    const result = await resolveInstance(testDir);

    expect(state.instanceId).toBeUndefined();
    expect(state.mode).toBe("normal");
    expect(result).toEqual({ mode: "normal" });
  });
});
