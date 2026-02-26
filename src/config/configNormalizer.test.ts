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
});
