import { describe, it, expect } from "vitest";
import { buildServiceName, buildPrefix, parseServiceName } from "./nameBuilder";

describe("nameBuilder", () => {
  describe("buildServiceName", () => {
    it("should build service name without instance", () => {
      const result = buildServiceName("myproject", "api");
      expect(result).toBe("zap.myproject.api");
    });

    it("should build service name with instance", () => {
      const result = buildServiceName("myproject", "api", "wt-abc123");
      expect(result).toBe("zap.myproject.wt-abc123.api");
    });

    it("should build service name with null instance", () => {
      const result = buildServiceName("myproject", "api", null);
      expect(result).toBe("zap.myproject.api");
    });

    it("should build service name with empty string instance", () => {
      const result = buildServiceName("myproject", "api", "");
      expect(result).toBe("zap.myproject.api");
    });
  });

  describe("buildPrefix", () => {
    it("should build prefix without instance", () => {
      const result = buildPrefix("myproject");
      expect(result).toBe("zap.myproject");
    });

    it("should build prefix with instance", () => {
      const result = buildPrefix("myproject", "wt-abc123");
      expect(result).toBe("zap.myproject.wt-abc123");
    });

    it("should build prefix with null instance", () => {
      const result = buildPrefix("myproject", null);
      expect(result).toBe("zap.myproject");
    });
  });

  describe("parseServiceName", () => {
    it("should parse standard service name", () => {
      const result = parseServiceName("zap.myproject.api");
      expect(result).toEqual({
        project: "myproject",
        service: "api",
      });
    });

    it("should parse service name with instance", () => {
      const result = parseServiceName("zap.myproject.wt-abc123.api");
      expect(result).toEqual({
        project: "myproject",
        instanceId: "wt-abc123",
        service: "api",
      });
    });

    it("should return null for invalid format", () => {
      expect(parseServiceName("invalid")).toBeNull();
      expect(parseServiceName("zap.only")).toBeNull();
      expect(parseServiceName("not.zap.format")).toBeNull();
    });

    it("should return null for too many segments", () => {
      const result = parseServiceName("zap.project.instance.service.extra");
      expect(result).toBeNull();
    });

    it("should handle edge cases", () => {
      expect(parseServiceName("")).toBeNull();
      expect(parseServiceName("zap")).toBeNull();
      expect(parseServiceName("zap.")).toBeNull();
    });
  });
});
