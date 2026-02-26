import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConfigPath, findFileUpwards } from "./findUp";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";

describe("findUp", () => {
  let testDir: string;
  let testCounter = 0;

  beforeEach(() => {
    testCounter++;
    testDir = path.join(tmpdir(), `zapper-test-${Date.now()}-${testCounter}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe("findFileUpwards", () => {
    it("should find zap.yaml in current directory", () => {
      const configPath = path.join(testDir, "zap.yaml");
      writeFileSync(
        configPath,
        "project: test\nnative:\n  test:\n    cmd: echo test",
      );

      const result = findFileUpwards(testDir);
      expect(result).toBe(configPath);
    });

    it("should find zap.yaml in parent directory", () => {
      const subDir = path.join(testDir, "subdir");
      mkdirSync(subDir);
      const configPath = path.join(testDir, "zap.yaml");
      writeFileSync(
        configPath,
        "project: test\nnative:\n  test:\n    cmd: echo test",
      );

      const result = findFileUpwards(subDir);
      expect(result).toBe(configPath);
    });

    it("should return null if no config found", () => {
      const result = findFileUpwards(testDir);
      expect(result).toBeNull();
    });

    it("should prefer zap.yaml over zap.yml", () => {
      const yamlPath = path.join(testDir, "zap.yaml");
      const ymlPath = path.join(testDir, "zap.yml");
      writeFileSync(
        yamlPath,
        "project: test\nnative:\n  test:\n    cmd: echo yaml",
      );
      writeFileSync(
        ymlPath,
        "project: test\nnative:\n  test:\n    cmd: echo yml",
      );

      const result = findFileUpwards(testDir);
      expect(result).toBe(yamlPath);
    });
  });

  describe("resolveConfigPath", () => {
    it("should use custom config file when specified and found", () => {
      const customConfig = path.join(testDir, "custom.yaml");
      writeFileSync(
        customConfig,
        "project: test\nnative:\n  test:\n    cmd: echo custom",
      );

      const result = resolveConfigPath(customConfig);
      expect(result).toBe(customConfig);
    });

    it("should return null when custom config specified but not found", () => {
      const customConfig = path.join(testDir, "nonexistent.yaml");
      const result = resolveConfigPath(customConfig);
      expect(result).toBeNull();
    });

    it("should NOT fall back to default zap.yaml when custom config not found", () => {
      // Create a zap.yaml in the test dir
      const defaultConfig = path.join(testDir, "zap.yaml");
      writeFileSync(
        defaultConfig,
        "project: test\nnative:\n  test:\n    cmd: echo default",
      );

      // Try to load a custom config that doesn't exist
      const customConfig = path.join(testDir, "custom.yaml");
      const result = resolveConfigPath(customConfig);

      // Should return null, not fall back to zap.yaml
      expect(result).toBeNull();
    });

    it("should use custom config from subdirectory without reverting to parent zap.yaml", () => {
      // Create zap.yaml in root
      const rootConfig = path.join(testDir, "zap.yaml");
      writeFileSync(
        rootConfig,
        "project: root\nnative:\n  test:\n    cmd: echo root",
      );

      // Create custom config in subdirectory
      const subDir = path.join(testDir, "subdir");
      mkdirSync(subDir);
      const customConfig = path.join(subDir, "custom.yaml");
      writeFileSync(
        customConfig,
        "project: custom\nnative:\n  test:\n    cmd: echo custom",
      );

      // Mock process.cwd to return subdirectory
      vi.spyOn(process, "cwd").mockReturnValue(subDir);

      // Resolve custom config with absolute path
      const result = resolveConfigPath(customConfig);

      // Should use custom config, not root zap.yaml
      expect(result).toBe(customConfig);
    });

    it("should find default config when walking up from subdirectory with no input", () => {
      const rootConfig = path.join(testDir, "zap.yaml");
      writeFileSync(
        rootConfig,
        "project: root\nnative:\n  test:\n    cmd: echo root",
      );

      const subDir = path.join(testDir, "subdir");
      mkdirSync(subDir);

      // Mock process.cwd to return subdirectory
      vi.spyOn(process, "cwd").mockReturnValue(subDir);

      // No input provided, should walk up and find zap.yaml
      const result = resolveConfigPath();
      expect(result).toBe(rootConfig);
    });

    it("should use absolute path for custom config", () => {
      const customConfig = path.join(testDir, "prod.yaml");
      writeFileSync(
        customConfig,
        "project: prod\nnative:\n  test:\n    cmd: echo prod",
      );

      const result = resolveConfigPath(customConfig);
      expect(result).toBe(customConfig);
      expect(path.isAbsolute(result!)).toBe(true);
    });

    it("should handle relative path for custom config", () => {
      const customConfig = path.join(testDir, "staging.yaml");
      writeFileSync(
        customConfig,
        "project: staging\nnative:\n  test:\n    cmd: echo staging",
      );

      vi.spyOn(process, "cwd").mockReturnValue(testDir);
      const result = resolveConfigPath("./staging.yaml");
      expect(result).toBe(customConfig);
    });

    it("should find default config in parent when given directory path", () => {
      const rootConfig = path.join(testDir, "zap.yaml");
      writeFileSync(
        rootConfig,
        "project: root\nnative:\n  test:\n    cmd: echo root",
      );

      const result = resolveConfigPath(testDir);
      expect(result).toBe(rootConfig);
    });
  });

  describe("integration scenarios (CLI behavior)", () => {
    describe("scenario 1: root directory + no --config flag", () => {
      it("should find default config in root directory", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo test",
        );

        vi.spyOn(process, "cwd").mockReturnValue(testDir);

        // Simulating CLI behavior: no --config flag means undefined is passed
        const result = resolveConfigPath(undefined);
        expect(result).toBe(rootConfig);
      });
    });

    describe("scenario 2: subdirectory + no --config flag", () => {
      it("should walk up and find config in parent directory", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo test",
        );

        const subDir = path.join(testDir, "subdir");
        mkdirSync(subDir);

        vi.spyOn(process, "cwd").mockReturnValue(subDir);

        // Simulating CLI behavior: no --config flag means undefined is passed
        const result = resolveConfigPath(undefined);
        expect(result).toBe(rootConfig);
      });

      it("should walk up multiple levels to find config", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo test",
        );

        const deepDir = path.join(testDir, "a", "b", "c");
        mkdirSync(deepDir, { recursive: true });

        vi.spyOn(process, "cwd").mockReturnValue(deepDir);

        const result = resolveConfigPath(undefined);
        expect(result).toBe(rootConfig);
      });
    });

    describe("scenario 3: root directory + custom --config flag", () => {
      it("should use specified config file", () => {
        const defaultConfig = path.join(testDir, "zap.yaml");
        const customConfig = path.join(testDir, "custom.yaml");
        writeFileSync(
          defaultConfig,
          "project: default\nnative:\n  test:\n    cmd: echo default",
        );
        writeFileSync(
          customConfig,
          "project: custom\nnative:\n  test:\n    cmd: echo custom",
        );

        vi.spyOn(process, "cwd").mockReturnValue(testDir);

        // Simulating CLI behavior: --config custom.yaml
        const result = resolveConfigPath("custom.yaml");
        expect(result).toBe(customConfig);
      });

      it("should return null when specified config doesn't exist", () => {
        const defaultConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          defaultConfig,
          "project: default\nnative:\n  test:\n    cmd: echo default",
        );

        vi.spyOn(process, "cwd").mockReturnValue(testDir);

        // Should NOT fall back to default config
        const result = resolveConfigPath("nonexistent.yaml");
        expect(result).toBeNull();
      });
    });

    describe("scenario 4: subdirectory + custom --config flag", () => {
      it("should use specified config from subdirectory, not walk up", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo root",
        );

        const subDir = path.join(testDir, "subdir");
        mkdirSync(subDir);
        const customConfig = path.join(subDir, "custom.yaml");
        writeFileSync(
          customConfig,
          "project: custom\nnative:\n  test:\n    cmd: echo custom",
        );

        vi.spyOn(process, "cwd").mockReturnValue(subDir);

        // Should use custom config in subdir, not root zap.yaml
        const result = resolveConfigPath("custom.yaml");
        expect(result).toBe(customConfig);
      });

      it("should return null when custom config in subdirectory doesn't exist", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo root",
        );

        const subDir = path.join(testDir, "subdir");
        mkdirSync(subDir);

        vi.spyOn(process, "cwd").mockReturnValue(subDir);

        // Should NOT fall back to root zap.yaml
        const result = resolveConfigPath("custom.yaml");
        expect(result).toBeNull();
      });

      it("should use absolute path to custom config regardless of cwd", () => {
        const rootConfig = path.join(testDir, "zap.yaml");
        const customConfig = path.join(testDir, "custom.yaml");
        writeFileSync(
          rootConfig,
          "project: root\nnative:\n  test:\n    cmd: echo root",
        );
        writeFileSync(
          customConfig,
          "project: custom\nnative:\n  test:\n    cmd: echo custom",
        );

        const subDir = path.join(testDir, "subdir");
        mkdirSync(subDir);

        vi.spyOn(process, "cwd").mockReturnValue(subDir);

        // Use absolute path to config in parent dir
        const result = resolveConfigPath(customConfig);
        expect(result).toBe(customConfig);
      });
    });
  });
});
