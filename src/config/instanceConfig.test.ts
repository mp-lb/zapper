import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import {
  loadInstanceConfig,
  saveInstanceConfig,
  InstanceConfig,
} from "./instanceConfig";

describe("instanceConfig", () => {
  const testDir = path.join(
    __dirname,
    "../../test-fixtures/instance-config-test",
  );
  const zapDir = path.join(testDir, ".zap");
  const configPath = path.join(zapDir, "instance.json");

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

  describe("loadInstanceConfig", () => {
    it("should return null when file does not exist", () => {
      const result = loadInstanceConfig(testDir);
      expect(result).toBeNull();
    });

    it("should load valid config", () => {
      const config: InstanceConfig = {
        instanceId: "wt-abc123",
        mode: "isolate",
      };

      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const result = loadInstanceConfig(testDir);
      expect(result).toEqual(config);
    });

    it("should load config with only instanceId", () => {
      const config: InstanceConfig = {
        instanceId: "my-instance",
      };

      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const result = loadInstanceConfig(testDir);
      expect(result).toEqual(config);
    });

    it("should load config with only mode", () => {
      const config: InstanceConfig = {
        mode: "exclusive",
      };

      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const result = loadInstanceConfig(testDir);
      expect(result).toEqual(config);
    });

    it("should load empty config", () => {
      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, "{}");

      const result = loadInstanceConfig(testDir);
      expect(result).toEqual({});
    });

    it("should return null for malformed JSON", () => {
      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, "invalid json");

      const result = loadInstanceConfig(testDir);
      expect(result).toBeNull();
    });

    it("should return null for empty file", () => {
      mkdirSync(zapDir, { recursive: true });
      writeFileSync(configPath, "");

      const result = loadInstanceConfig(testDir);
      expect(result).toBeNull();
    });
  });

  describe("saveInstanceConfig", () => {
    it("should save config and create .zap directory", () => {
      const config: InstanceConfig = {
        instanceId: "wt-abc123",
        mode: "isolate",
      };

      saveInstanceConfig(testDir, config);

      expect(existsSync(zapDir)).toBe(true);
      expect(existsSync(configPath)).toBe(true);

      const saved = loadInstanceConfig(testDir);
      expect(saved).toEqual(config);
    });

    it("should save config to existing .zap directory", () => {
      mkdirSync(zapDir, { recursive: true });

      const config: InstanceConfig = {
        mode: "exclusive",
      };

      saveInstanceConfig(testDir, config);

      const saved = loadInstanceConfig(testDir);
      expect(saved).toEqual(config);
    });

    it("should overwrite existing config", () => {
      const originalConfig: InstanceConfig = {
        instanceId: "old-id",
      };
      const newConfig: InstanceConfig = {
        instanceId: "new-id",
        mode: "isolate",
      };

      saveInstanceConfig(testDir, originalConfig);
      saveInstanceConfig(testDir, newConfig);

      const saved = loadInstanceConfig(testDir);
      expect(saved).toEqual(newConfig);
    });

    it("should save empty config", () => {
      const config: InstanceConfig = {};

      saveInstanceConfig(testDir, config);

      const saved = loadInstanceConfig(testDir);
      expect(saved).toEqual({});
    });

    it("should handle null instanceId", () => {
      const config: InstanceConfig = {
        instanceId: null,
        mode: "exclusive",
      };

      saveInstanceConfig(testDir, config);

      const saved = loadInstanceConfig(testDir);
      expect(saved).toEqual(config);
    });
  });
});
