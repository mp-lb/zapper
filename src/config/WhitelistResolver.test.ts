import { describe, it, expect } from "vitest";
import { WhitelistResolver } from "./WhitelistResolver";
import { ZapperConfig } from "./schemas";

describe("WhitelistResolver", () => {
  describe("validateReferences", () => {
    it("should pass when no whitelists are defined and no string env references exist", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          app: {
            cmd: "npm start",
            env: ["PORT", "API_URL"],
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).not.toThrow();
    });

    it("should throw when string env reference exists but no whitelists are defined", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          app: {
            cmd: "npm start",
            env: "common-vars",
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).toThrow(
        "Environment whitelist references found but no whitelists defined",
      );
    });

    it("should pass when all string env references are valid", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "frontend-vars": ["PORT", "API_URL"],
          "backend-vars": ["DATABASE_URL", "JWT_SECRET"],
        },
        native: {
          frontend: {
            cmd: "npm start",
            env: "frontend-vars",
          },
          backend: {
            cmd: "npm run server",
            env: "backend-vars",
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).not.toThrow();
    });

    it("should throw when string env reference is invalid", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "frontend-vars": ["PORT", "API_URL"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "non-existent-whitelist",
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).toThrow(
        "Process 'app' references unknown whitelist 'non-existent-whitelist'",
      );
    });

    it("should validate references in all entity types", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "app-vars": ["PORT", "API_URL"],
          "db-vars": ["POSTGRES_DB", "POSTGRES_USER"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "app-vars",
          },
        },
        docker: {
          database: {
            image: "postgres:15",
            env: "db-vars",
          },
        },
        tasks: {
          build: {
            cmds: ["npm run build"],
            env: "app-vars",
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).not.toThrow();
    });

    it("should throw for invalid task reference", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "app-vars": ["PORT"],
        },
        tasks: {
          build: {
            cmds: ["npm run build"],
            env: "invalid-whitelist",
          },
        },
      };

      expect(() => WhitelistResolver.validateReferences(config)).toThrow(
        "Task 'build' references unknown whitelist 'invalid-whitelist'",
      );
    });
  });

  describe("resolve", () => {
    it("should return config unchanged when no whitelists exist", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          app: {
            cmd: "npm start",
            env: ["PORT", "API_URL"],
          },
        },
      };

      const result = WhitelistResolver.resolve(config);
      expect(result).toEqual(config);
    });

    it("should resolve string env references to arrays", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "frontend-vars": ["PORT", "API_URL"],
          "backend-vars": ["DATABASE_URL", "JWT_SECRET"],
        },
        native: {
          frontend: {
            cmd: "npm start",
            env: "frontend-vars",
          },
          backend: {
            cmd: "npm run server",
            env: "backend-vars",
          },
        },
      };

      const result = WhitelistResolver.resolve(config);

      expect(result.native?.frontend.env).toEqual(["PORT", "API_URL"]);
      expect(result.native?.backend.env).toEqual([
        "DATABASE_URL",
        "JWT_SECRET",
      ]);
    });

    it("should leave array env values unchanged", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "frontend-vars": ["PORT", "API_URL"],
        },
        native: {
          frontend: {
            cmd: "npm start",
            env: "frontend-vars",
          },
          backend: {
            cmd: "npm run server",
            env: ["DATABASE_URL", "JWT_SECRET"],
          },
        },
      };

      const result = WhitelistResolver.resolve(config);

      expect(result.native?.frontend.env).toEqual(["PORT", "API_URL"]);
      expect(result.native?.backend.env).toEqual([
        "DATABASE_URL",
        "JWT_SECRET",
      ]);
    });

    it("should resolve references in all entity types", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "app-vars": ["PORT", "API_URL"],
          "db-vars": ["POSTGRES_DB", "POSTGRES_USER"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "app-vars",
          },
        },
        docker: {
          database: {
            image: "postgres:15",
            env: "db-vars",
          },
        },
        tasks: {
          build: {
            cmds: ["npm run build"],
            env: "app-vars",
          },
        },
      };

      const result = WhitelistResolver.resolve(config);

      expect(result.native?.app.env).toEqual(["PORT", "API_URL"]);
      expect(result.docker?.database.env).toEqual([
        "POSTGRES_DB",
        "POSTGRES_USER",
      ]);
      expect(result.tasks?.build.env).toEqual(["PORT", "API_URL"]);
    });

    it("should create deep clone and not modify original config", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "app-vars": ["PORT", "API_URL"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "app-vars",
          },
        },
      };

      const result = WhitelistResolver.resolve(config);

      expect(result).not.toBe(config);
      expect(result.native?.app).not.toBe(config.native?.app);
      expect(config.native?.app.env).toBe("app-vars");
      expect(result.native?.app.env).toEqual(["PORT", "API_URL"]);
    });

    it("should throw for invalid whitelist reference during resolution", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "valid-vars": ["PORT"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "invalid-whitelist",
          },
        },
      };

      expect(() => WhitelistResolver.resolve(config)).toThrow(
        "Process 'app' references unknown whitelist 'invalid-whitelist'",
      );
    });

    it("should handle containers field in addition to docker field", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "db-vars": ["POSTGRES_DB"],
        },
        containers: {
          database: {
            image: "postgres:15",
            env: "db-vars",
          },
        },
      };

      const result = WhitelistResolver.resolve(config);
      expect(result.containers?.database.env).toEqual(["POSTGRES_DB"]);
    });

    it("should handle processes array in addition to native", () => {
      const config: ZapperConfig = {
        project: "test",
        whitelists: {
          "app-vars": ["PORT"],
        },
        processes: [
          {
            name: "web",
            cmd: "npm start",
            env: "app-vars",
          },
        ],
      };

      const result = WhitelistResolver.resolve(config);
      expect(result.processes?.[0].env).toEqual(["PORT"]);
    });
  });
});
