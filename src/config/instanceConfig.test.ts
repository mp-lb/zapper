import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { loadInstanceConfig, saveInstanceConfig } from "./instanceConfig";
import { loadState } from "./stateLoader";

describe("instanceConfig", () => {
  const testDir = path.join(__dirname, "../../test-fixtures/instance-config");

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

  it("returns null when instance is not configured", () => {
    expect(loadInstanceConfig(testDir)).toBeNull();
  });

  it("saves and loads isolated instance config via state.json", () => {
    saveInstanceConfig(testDir, { instanceId: "wt-abc123", mode: "isolate" });

    expect(loadInstanceConfig(testDir)).toEqual({
      instanceId: "wt-abc123",
      mode: "isolate",
    });
    expect(loadState(testDir).instanceId).toBe("wt-abc123");
  });

  it("clears isolation when instanceId is null", () => {
    saveInstanceConfig(testDir, { instanceId: "foo", mode: "isolate" });
    saveInstanceConfig(testDir, { instanceId: null, mode: "normal" });

    expect(loadInstanceConfig(testDir)).toBeNull();
    expect(loadState(testDir).mode).toBe("normal");
  });
});
