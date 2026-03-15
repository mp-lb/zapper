import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createContext } from "./createContext";
import { ZapperConfig, ZapperState, Process } from "../config/schemas";
import * as stateLoader from "../config/stateLoader";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";

describe("createContext", () => {
  let testDir: string;
  let testCounter = 0;
  let mockLoadState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    testCounter++;
    testDir = path.join(tmpdir(), `zapper-test-${Date.now()}-${testCounter}`);
    mkdirSync(testDir, { recursive: true });

    // Mock stateLoader.loadState
    mockLoadState = vi.fn();
    vi.spyOn(stateLoader, "loadState").mockImplementation(mockLoadState);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe("native processes extraction", () => {
    it("should extract native processes with names as keys", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm run dev" },
          worker: { cmd: "npm run worker", cwd: "./worker" },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.processes).toHaveLength(2);
      expect(result.processes).toContainEqual({
        name: "api",
        cmd: "npm run dev",
      });
      expect(result.processes).toContainEqual({
        name: "worker",
        cmd: "npm run worker",
        cwd: "./worker",
      });
    });

    it("should handle empty native processes", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {},
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.processes).toHaveLength(0);
    });

    it("should handle config without native processes", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.processes).toHaveLength(0);
    });
  });

  describe("legacy processes array format", () => {
    it("should extract processes from processes array", () => {
      const config: ZapperConfig = {
        project: "test-project",
        processes: [
          { name: "api", cmd: "npm run dev" },
          { name: "worker", cmd: "npm run worker", cwd: "./worker" },
        ],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.processes).toHaveLength(2);
      expect(result.processes).toContainEqual({
        name: "api",
        cmd: "npm run dev",
      });
      expect(result.processes).toContainEqual({
        name: "worker",
        cmd: "npm run worker",
        cwd: "./worker",
      });
    });

    it("should throw error if process in array is missing name", () => {
      const config: ZapperConfig = {
        project: "test-project",
        processes: [
          { cmd: "npm run dev" } as Omit<Process, "name">, // Missing name field
        ],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      expect(() => createContext(config, testDir)).toThrow(
        "Process in processes array missing name field",
      );
    });

    it("should handle both native and processes array formats", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "native api" },
        },
        processes: [{ name: "legacy", cmd: "legacy process" }],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.processes).toHaveLength(2);
      expect(result.processes).toContainEqual({
        name: "api",
        cmd: "native api",
      });
      expect(result.processes).toContainEqual({
        name: "legacy",
        cmd: "legacy process",
      });
    });
  });

  describe("docker/containers extraction", () => {
    it("should extract docker containers", () => {
      const config: ZapperConfig = {
        project: "test-project",
        docker: {
          postgres: { image: "postgres:13" },
          redis: { image: "redis:alpine", ports: ["6379:6379"] },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.containers).toHaveLength(2);
      expect(result.containers).toContainEqual({
        name: "postgres",
        image: "postgres:13",
      });
      expect(result.containers).toContainEqual({
        name: "redis",
        image: "redis:alpine",
        ports: ["6379:6379"],
      });
    });

    it("should extract containers using containers key", () => {
      const config: ZapperConfig = {
        project: "test-project",
        containers: {
          mongo: { image: "mongo:latest" },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.containers).toHaveLength(1);
      expect(result.containers).toContainEqual({
        name: "mongo",
        image: "mongo:latest",
      });
    });

    it("should handle empty containers", () => {
      const config: ZapperConfig = {
        project: "test-project",
        docker: {},
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.containers).toHaveLength(0);
    });

    it("should handle config without containers", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.containers).toHaveLength(0);
    });
  });

  describe("tasks extraction", () => {
    it("should extract tasks with names as keys", () => {
      const config: ZapperConfig = {
        project: "test-project",
        tasks: {
          build: { cmd: "npm run build" },
          test: { cmd: "npm test", desc: "Run tests" },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks).toContainEqual({
        name: "build",
        cmd: "npm run build",
      });
      expect(result.tasks).toContainEqual({
        name: "test",
        cmd: "npm test",
        desc: "Run tests",
      });
    });

    it("should handle empty tasks", () => {
      const config: ZapperConfig = {
        project: "test-project",
        tasks: {},
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.tasks).toHaveLength(0);
    });

    it("should handle config without tasks", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.tasks).toHaveLength(0);
    });
  });

  describe("init task", () => {
    it("should map init_task into context.initTask", () => {
      const config: ZapperConfig = {
        project: "test-project",
        init_task: "seed",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.initTask).toBe("seed");
    });
  });

  describe("env_files resolution", () => {
    describe("array format", () => {
      it("should resolve relative paths to absolute paths", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: [".env", "config/.env.local"],
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toEqual([
          path.join(testDir, ".env"),
          path.join(testDir, "config/.env.local"),
        ]);
        expect(result.environments).toEqual(["default"]);
      });

      it("should keep absolute paths unchanged", () => {
        const absolutePath = "/absolute/path/.env";
        const config: ZapperConfig = {
          project: "test-project",
          env_files: [absolutePath, ".env.local"],
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toEqual([
          absolutePath,
          path.join(testDir, ".env.local"),
        ]);
      });

      it("should handle empty array", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: [],
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toBeUndefined();
        expect(result.environments).toEqual([]);
      });

      it("should throw error for invalid active environment with array format", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: [".env"],
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
          activeEnvironment: "production",
        });

        expect(() => createContext(config, testDir)).toThrow(
          "Environment not found: production. Available environments: default",
        );
      });
    });

    describe("named sets format", () => {
      it("should use default environment when none specified in state", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: {
            default: [".env"],
            production: [".env.prod"],
          },
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toEqual([path.join(testDir, ".env")]);
        expect(result.environments).toEqual(["default", "production"]);
      });

      it("should use active environment from state", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: {
            default: [".env"],
            production: [".env.prod", ".env.secrets"],
          },
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
          activeEnvironment: "production",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toEqual([
          path.join(testDir, ".env.prod"),
          path.join(testDir, ".env.secrets"),
        ]);
        expect(result.environments).toEqual(["default", "production"]);
      });

      it("should throw error for invalid active environment", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: {
            default: [".env"],
            production: [".env.prod"],
          },
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
          activeEnvironment: "staging",
        });

        expect(() => createContext(config, testDir)).toThrow(
          "Environment not found: staging. Available environments: default, production",
        );
      });

      it("should handle missing default environment gracefully", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: {
            production: [".env.prod"],
          },
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toBeUndefined();
        expect(result.environments).toEqual(["production"]);
      });

      it("should resolve relative paths to absolute paths in named sets", () => {
        const config: ZapperConfig = {
          project: "test-project",
          env_files: {
            default: ["config/.env", "/absolute/.env"],
          },
        };

        mockLoadState.mockReturnValue({
          lastUpdated: "2024-01-01T00:00:00.000Z",
        });

        const result = createContext(config, testDir);

        expect(result.envFiles).toEqual([
          path.join(testDir, "config/.env"),
          "/absolute/.env",
        ]);
      });
    });
  });

  describe("profile extraction", () => {
    it("should extract unique profiles from processes and containers", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm run dev", profiles: ["web", "dev"] },
          worker: { cmd: "npm run worker", profiles: ["background"] },
        },
        docker: {
          postgres: { image: "postgres:13", profiles: ["db", "dev"] },
          redis: { image: "redis:alpine", profiles: ["cache"] },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.profiles).toEqual([
        "background",
        "cache",
        "db",
        "dev",
        "web",
      ]);
    });

    it("should handle processes and containers without profiles", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm run dev" },
        },
        docker: {
          postgres: { image: "postgres:13" },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.profiles).toEqual([]);
    });

    it("should handle empty profiles arrays", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm run dev", profiles: [] },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.profiles).toEqual([]);
    });

    it("should deduplicate profiles", () => {
      const config: ZapperConfig = {
        project: "test-project",
        native: {
          api: { cmd: "npm run dev", profiles: ["web", "dev"] },
          frontend: { cmd: "npm run frontend", profiles: ["web", "dev"] },
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.profiles).toEqual(["dev", "web"]);
    });
  });

  describe("state loading", () => {
    it("should load state from stateLoader", () => {
      const mockState: ZapperState = {
        lastUpdated: "2024-01-01T00:00:00.000Z",
        activeEnvironment: "production",
        services: {
          api: { status: "running", pid: 1234 },
        },
      };

      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue(mockState);

      const result = createContext(config, testDir);

      expect(mockLoadState).toHaveBeenCalledWith(testDir);
      expect(result.state).toEqual(mockState);
    });
  });

  describe("homepage, notes, and links passthrough", () => {
    it("should pass through homepage from config", () => {
      const config: ZapperConfig = {
        project: "test-project",
        homepage: "http://localhost:3000",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.homepage).toBe("http://localhost:3000");
    });

    it("should pass through links from config", () => {
      const links = [
        { name: "docs", url: "https://example.com/docs" },
        { name: "staging", url: "https://staging.example.com" },
      ];

      const config: ZapperConfig = {
        project: "test-project",
        links,
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.links).toEqual(links);
    });

    it("should pass through notes from config", () => {
      const config: ZapperConfig = {
        project: "test-project",
        notes: "Use PORT=${PORT}",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.notes).toBe("Use PORT=${PORT}");
    });

    it("should handle empty links array", () => {
      const config: ZapperConfig = {
        project: "test-project",
        links: [],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.links).toEqual([]);
    });

    it("should handle missing links", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.links).toEqual([]);
    });

    it("should handle missing homepage", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.homepage).toBeUndefined();
    });

    it("should handle missing notes", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.notes).toBeUndefined();
    });
  });

  describe("other config fields passthrough", () => {
    it("should pass through all config fields correctly", () => {
      const config: ZapperConfig = {
        project: "my-awesome-project",
        git_method: "ssh",
        task_delimiters: ["{{", "}}"],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.projectName).toBe("my-awesome-project");
      expect(result.projectRoot).toBe(testDir);
      expect(result.gitMethod).toBe("ssh");
      expect(result.taskDelimiters).toEqual(["{{", "}}"]);
    });

    it("should handle optional fields as undefined", () => {
      const config: ZapperConfig = {
        project: "minimal-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.projectName).toBe("minimal-project");
      expect(result.projectRoot).toBe(testDir);
      expect(result.gitMethod).toBeUndefined();
      expect(result.taskDelimiters).toBeUndefined();
      expect(result.envFiles).toBeUndefined();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complex config with all features", () => {
      const config: ZapperConfig = {
        project: "complex-project",
        git_method: "cli",
        task_delimiters: ["{%", "%}"],
        env_files: {
          default: [".env", ".env.local"],
          production: [".env.prod"],
        },
        native: {
          api: { cmd: "npm run dev", profiles: ["web"] },
        },
        processes: [{ name: "legacy", cmd: "legacy command" }],
        docker: {
          postgres: { image: "postgres:13", profiles: ["db"] },
        },
        tasks: {
          build: { cmd: "npm run build" },
        },
        homepage: "http://localhost:3000",
        notes: "Run migrations after startup",
        links: [{ name: "docs", url: "https://docs.example.com" }],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
        activeEnvironment: "production",
      });

      const result = createContext(config, testDir);

      expect(result.projectName).toBe("complex-project");
      expect(result.projectRoot).toBe(testDir);
      expect(result.gitMethod).toBe("cli");
      expect(result.taskDelimiters).toEqual(["{%", "%}"]);
      expect(result.envFiles).toEqual([path.join(testDir, ".env.prod")]);
      expect(result.environments).toEqual(["default", "production"]);
      expect(result.processes).toHaveLength(2);
      expect(result.containers).toHaveLength(1);
      expect(result.tasks).toHaveLength(1);
      expect(result.homepage).toBe("http://localhost:3000");
      expect(result.notes).toBe("Run migrations after startup");
      expect(result.links).toHaveLength(1);
      expect(result.profiles).toEqual(["db", "web"]);
    });
  });

  describe("ports field", () => {
    it("should include ports from config", () => {
      const config: ZapperConfig = {
        project: "test-project",
        ports: ["FRONTEND_PORT", "BACKEND_PORT", "DB_PORT"],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.ports).toEqual([
        "FRONTEND_PORT",
        "BACKEND_PORT",
        "DB_PORT",
      ]);
    });

    it("should handle config without ports", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.ports).toBeUndefined();
    });

    it("should handle empty ports array", () => {
      const config: ZapperConfig = {
        project: "test-project",
        ports: [],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      const result = createContext(config, testDir);

      expect(result.ports).toEqual([]);
    });
  });

  describe("error cases", () => {
    it("should propagate stateLoader errors", () => {
      const config: ZapperConfig = {
        project: "test-project",
      };

      mockLoadState.mockImplementation(() => {
        throw new Error("State loading failed");
      });

      expect(() => createContext(config, testDir)).toThrow(
        "State loading failed",
      );
    });

    it("should throw error for process without name in processes array", () => {
      const config: ZapperConfig = {
        project: "test-project",
        processes: [
          { cmd: "some command" } as Omit<Process, "name">, // Missing name
        ],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });

      expect(() => createContext(config, testDir)).toThrow(
        "Process in processes array missing name field",
      );
    });

    it("should handle invalid active environment with array env_files", () => {
      const config: ZapperConfig = {
        project: "test-project",
        env_files: [".env"],
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
        activeEnvironment: "invalid",
      });

      expect(() => createContext(config, testDir)).toThrow(
        "Environment not found: invalid. Available environments: default",
      );
    });

    it("should handle invalid active environment with named env_files", () => {
      const config: ZapperConfig = {
        project: "test-project",
        env_files: {
          dev: [".env.dev"],
          prod: [".env.prod"],
        },
      };

      mockLoadState.mockReturnValue({
        lastUpdated: "2024-01-01T00:00:00.000Z",
        activeEnvironment: "staging",
      });

      expect(() => createContext(config, testDir)).toThrow(
        "Environment not found: staging. Available environments: dev, prod",
      );
    });
  });
});
