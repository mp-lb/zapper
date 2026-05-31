import { describe, it, expect } from "vitest";
import { normalizeConfig, RawConfig } from "./configNormalizer";

describe("configNormalizer", () => {
  describe("normalizeConfig", () => {
    it("should map bare_metal to native for backward compatibility", () => {
      const config: RawConfig = {
        project: "test",
        bare_metal: {
          api: { cmd: "npm run dev" },
        },
      };

      const result = normalizeConfig(config);

      expect(result.native).toEqual({ api: { cmd: "npm run dev" } });
      expect(result.bare_metal).toBeUndefined();
    });

    it("should preserve native if already present", () => {
      const config: RawConfig = {
        project: "test",
        native: {
          api: { cmd: "npm run dev" },
        },
      };

      const result = normalizeConfig(config);

      expect(result.native).toEqual({ api: { cmd: "npm run dev" } });
    });

    it("should prefer native over bare_metal if both present", () => {
      const config: RawConfig = {
        project: "test",
        native: {
          api: { cmd: "npm run native" },
        },
        bare_metal: {
          api: { cmd: "npm run legacy" },
        },
      };

      const result = normalizeConfig(config);

      expect(result.native).toEqual({ api: { cmd: "npm run native" } });
      expect(result.bare_metal).toBeUndefined();
    });

    it("should handle config with no native or bare_metal", () => {
      const config: RawConfig = {
        project: "test",
        docker: {
          db: { image: "postgres:15" },
        },
      };

      const result = normalizeConfig(config);

      expect(result.native).toBeUndefined();
      expect(result.docker).toEqual({ db: { image: "postgres:15" } });
    });

    it("should handle null config", () => {
      const result = normalizeConfig(null as unknown as RawConfig);
      expect(result).toBeNull();
    });
  });

  describe("kebab-case key normalization", () => {
    it("rewrites top-level kebab-case keys to snake_case", () => {
      const config = {
        project: "test",
        "env-files": ["a.yaml"],
        "init-task": "setup",
        "git-method": "ssh",
        "task-delimiters": ["{{", "}}"],
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, unknown>;

      expect(result.env_files).toEqual(["a.yaml"]);
      expect(result.init_task).toBe("setup");
      expect(result.git_method).toBe("ssh");
      expect(result.task_delimiters).toEqual(["{{", "}}"]);
      expect(result["env-files"]).toBeUndefined();
      expect(result["init-task"]).toBeUndefined();
    });

    it("rewrites depends-on nested in native and docker services", () => {
      const config = {
        project: "test",
        native: {
          web: { cmd: "dev", "depends-on": ["api"] },
        },
        docker: {
          db: { image: "postgres:15", "depends-on": ["cache"] },
        },
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, any>;

      expect(result.native.web.depends_on).toEqual(["api"]);
      expect(result.native.web["depends-on"]).toBeUndefined();
      expect(result.docker.db.depends_on).toEqual(["cache"]);
    });

    it("rewrites internal-dir and read-only inside container volumes", () => {
      const config = {
        project: "test",
        docker: {
          db: {
            image: "postgres:15",
            volumes: [
              { name: "data", "internal-dir": "/var/lib" },
              { target: "/etc", "read-only": true },
            ],
          },
        },
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, any>;

      expect(result.docker.db.volumes[0].internal_dir).toBe("/var/lib");
      expect(result.docker.db.volumes[1].read_only).toBe(true);
    });

    it("rewrites env-files inside profiles", () => {
      const config = {
        project: "test",
        profiles: {
          dev: { "env-files": ["dev.yaml"] },
        },
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, any>;

      expect(result.profiles.dev.env_files).toEqual(["dev.yaml"]);
    });

    it("leaves user-chosen names untouched even if they look like config keys", () => {
      const config = {
        project: "test",
        native: {
          // a process literally named "depends-on" must survive as-is
          "depends-on": { cmd: "dev" },
        },
        tasks: {
          "init-task": { cmds: ["echo hi"] },
        },
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, any>;

      expect(result.native["depends-on"]).toEqual({ cmd: "dev" });
      expect(result.tasks["init-task"]).toEqual({ cmds: ["echo hi"] });
    });

    it("accepts snake_case keys unchanged", () => {
      const config = {
        project: "test",
        env_files: ["a.yaml"],
        native: { web: { cmd: "dev", depends_on: ["api"] } },
      } as unknown as RawConfig;

      const result = normalizeConfig(config) as Record<string, any>;

      expect(result.env_files).toEqual(["a.yaml"]);
      expect(result.native.web.depends_on).toEqual(["api"]);
    });

    it("throws when the same key is given in both casings with different values", () => {
      const config = {
        project: "test",
        native: {
          web: { cmd: "dev", "depends-on": ["api"], depends_on: ["other"] },
        },
      } as unknown as RawConfig;

      expect(() => normalizeConfig(config)).toThrow(/conflicts/);
    });
  });
});
