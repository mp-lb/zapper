import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { executeActions } from "./executeActions";
import { ZapperConfig } from "../utils";
import { DockerManager } from "./docker";
import { NativeProcessExecutor } from "./process/NativeProcessExecutor";
import { ActionPlan } from "../types";
import { findProcess } from "./findProcess";
import { findContainer } from "./findContainer";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("./docker");
vi.mock("./findProcess");
vi.mock("./findContainer");
vi.mock("../config/stateLoader", () => ({
  loadState: vi.fn(() => ({
    instances: {
      default: {
        id: "default",
        volumes: {},
      },
    },
  })),
  saveState: vi.fn(),
  updateState: vi.fn((projectRoot, updater) => {
    void projectRoot;
    return {
      instances: {
        default: {
          id: "default",
          volumes: {},
        },
      },
      ...updater({
        instances: {
          default: {
            id: "default",
            volumes: {},
          },
        },
      }),
    };
  }),
  updateServiceState: vi.fn(),
  clearServiceState: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    setSink: vi.fn(),
  },
}));

vi.mock("./process/NativeProcessExecutor", () => {
  return {
    NativeProcessExecutor: vi.fn(),
  };
});

describe("executeActions", () => {
  let mockConfig: ZapperConfig;
  let mockNativeProcessExecutor: {
    startProcess: ReturnType<typeof vi.fn>;
    stopProcess: ReturnType<typeof vi.fn>;
    restartProcess: ReturnType<typeof vi.fn>;
    showLogs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    mockConfig = {
      project: "test-project",
      native: {
        api: {
          name: "api",
          cmd: "npm start",
          cwd: "./api",
        },
        worker: {
          name: "worker",
          cmd: "node worker.js",
        },
      },
      docker: {
        database: {
          image: "postgres:15",
          hostname: "database",
          ports: ["5432:5432"],
          volumes: [
            "postgres_data:/var/lib/postgresql/data",
            {
              name: "postgres_config",
              internal_dir: "/etc/postgresql",
            },
          ],
          resolvedEnv: {
            POSTGRES_DB: "testdb",
            POSTGRES_USER: "testuser",
          },
          networks: ["app-network"],
          command: "postgres -c log_statement=all",
        },
        redis: {
          image: "redis:7",
          ports: ["6379:6379"],
        },
      },
    };

    mockNativeProcessExecutor = {
      startProcess: vi.fn().mockResolvedValue(undefined),
      stopProcess: vi.fn().mockResolvedValue(undefined),
      restartProcess: vi.fn().mockResolvedValue(undefined),
      showLogs: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(NativeProcessExecutor).mockImplementation(function () {
      return mockNativeProcessExecutor as any;
    });

    vi.mocked(DockerManager.createVolume).mockResolvedValue(undefined);
    vi.mocked(DockerManager.buildImage).mockResolvedValue(undefined);
    vi.mocked(DockerManager.startContainerAsync).mockResolvedValue(12345);
    vi.mocked(DockerManager.stopContainer).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("bare metal service actions", () => {
    it("should start a bare metal process", async () => {
      const mockProcess = {
        name: "api",
        cmd: "npm start",
        cwd: "./api",
      };

      vi.mocked(findProcess).mockReturnValue(mockProcess);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(findProcess).toHaveBeenCalledWith(mockConfig, "api");
      expect(mockNativeProcessExecutor.startProcess).toHaveBeenCalledWith(
        mockProcess,
        "test-project",
      );
    });

    it("should stop a bare metal process", async () => {
      const mockProcess = {
        name: "worker",
        cmd: "node worker.js",
      };

      vi.mocked(findProcess).mockReturnValue(mockProcess);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "stop",
                serviceType: "native",
                name: "worker",
                healthcheck: 5,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(findProcess).toHaveBeenCalledWith(mockConfig, "worker");
      expect(mockNativeProcessExecutor.stopProcess).toHaveBeenCalledWith(
        "worker",
      );
    });

    it("should throw error when bare metal process not found", async () => {
      vi.mocked(findProcess).mockReturnValue(undefined);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "nonexistent",
                healthcheck: 5,
              },
            ],
          },
        ],
      };

      await expect(
        executeActions(mockConfig, "test-project", "/config/dir", plan),
      ).rejects.toThrow("Process not found: nonexistent");
    });
  });

  describe("docker service actions", () => {
    it("should start a docker container with volumes and environment", async () => {
      const mockContainer = mockConfig.docker!.database;
      vi.mocked(findContainer).mockReturnValue(["database", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "database",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(findContainer).toHaveBeenCalledWith(mockConfig, "database");
      expect(DockerManager.createVolume).toHaveBeenCalledWith("postgres_data");
      expect(DockerManager.createVolume).toHaveBeenCalledWith(
        "postgres_config",
      );

      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.database",
        {
          image: "postgres:15",
          hostname: "database",
          ports: ["5432:5432"],
          volumes: [
            "postgres_data:/var/lib/postgresql/data",
            "postgres_config:/etc/postgresql",
          ],
          networks: ["app-network"],
          environment: {
            POSTGRES_DB: "testdb",
            POSTGRES_USER: "testuser",
          },
          command: "postgres -c log_statement=all",
          labels: {
            "com.docker.compose.project": "test-project",
            "com.docker.compose.service": "database",
            "com.zapper.project": "test-project",
            "com.zapper.service": "database",
            "com.zapper.instance-id": "",
            "com.zapper.instance-key": "default",
          },
        },
        {
          projectName: "test-project",
          serviceName: "database",
          configDir: "/config/dir",
        },
      );
    });

    it("should start a docker container with minimal configuration", async () => {
      const mockContainer = mockConfig.docker!.redis;
      vi.mocked(findContainer).mockReturnValue(["redis", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "redis",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.redis",
        {
          image: "redis:7",
          ports: ["6379:6379"],
          volumes: [],
          networks: undefined,
          environment: {},
          command: undefined,
          labels: {
            "com.docker.compose.project": "test-project",
            "com.docker.compose.service": "redis",
            "com.zapper.project": "test-project",
            "com.zapper.service": "redis",
            "com.zapper.instance-id": "",
            "com.zapper.instance-key": "default",
          },
        },
        {
          projectName: "test-project",
          serviceName: "redis",
          configDir: "/config/dir",
        },
      );
    });

    it("should stop a docker container", async () => {
      const mockContainer = mockConfig.docker!.redis;
      vi.mocked(findContainer).mockReturnValue(["redis", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "stop",
                serviceType: "docker",
                name: "redis",
                healthcheck: 5,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(findContainer).toHaveBeenCalledWith(mockConfig, "redis");
      expect(DockerManager.stopContainer).toHaveBeenCalledWith(
        "zap.test-project.redis",
      );
    });

    it("should throw error when docker service not found", async () => {
      vi.mocked(findContainer).mockReturnValue(undefined);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "nonexistent",
                healthcheck: 5,
              },
            ],
          },
        ],
      };

      await expect(
        executeActions(mockConfig, "test-project", "/config/dir", plan),
      ).rejects.toThrow("Docker service not found: nonexistent");
    });

    it("should handle volumes with different formats", async () => {
      const mockContainer = {
        image: "test:latest",
        volumes: [
          "simple_volume:/data",
          {
            name: "complex_volume",
            internal_dir: "/app/data",
          },
        ],
      };

      vi.mocked(findContainer).mockReturnValue(["test", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "test",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(DockerManager.createVolume).toHaveBeenCalledWith("simple_volume");
      expect(DockerManager.createVolume).toHaveBeenCalledWith("complex_volume");

      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.test",
        expect.objectContaining({
          volumes: ["simple_volume:/data", "complex_volume:/app/data"],
        }),
        {
          projectName: "test-project",
          serviceName: "test",
          configDir: "/config/dir",
        },
      );
    });

    it("should generate instance-scoped volumes for path-only mounts", async () => {
      const mockContainer = {
        image: "test:latest",
        volumes: ["/data:ro", { internal_dir: "/cache", mode: "rw" }],
      };

      vi.mocked(findContainer).mockReturnValue(["test", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "test",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(
        {
          ...mockConfig,
          instanceId: "inst123",
          instanceKey: "default",
        } as ZapperConfig & { instanceId: string; instanceKey: string },
        "test-project",
        "/config/dir",
        plan,
      );

      expect(DockerManager.createVolume).toHaveBeenCalledWith(
        "zap.test-project.inst123.vol1",
      );

      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.inst123.test",
        expect.objectContaining({
          volumes: [
            "zap.test-project.inst123.vol1:/data:ro",
            "zap.test-project.inst123.vol2:/cache:rw",
          ],
        }),
        {
          projectName: "test-project",
          serviceName: "test",
          configDir: "/config/dir",
        },
      );
    });

    it("should pass bind mounts through without creating Docker volumes", async () => {
      const mockContainer = {
        image: "test:latest",
        volumes: ["./init.sql:/docker-entrypoint-initdb.d/init.sql"],
      };

      vi.mocked(findContainer).mockReturnValue(["test", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "test",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(DockerManager.createVolume).not.toHaveBeenCalled();
      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.test",
        expect.objectContaining({
          volumes: ["./init.sql:/docker-entrypoint-initdb.d/init.sql"],
        }),
        {
          projectName: "test-project",
          serviceName: "test",
          configDir: "/config/dir",
        },
      );
    });

    it("should build Docker images and mount env-backed secrets", async () => {
      process.env.TEST_DB_PASSWORD = "secret-value";
      const projectRoot = mkdtempSync(path.join(tmpdir(), "zapper-actions-"));

      const mockContainer = {
        build: {
          context: "./api",
          dockerfile: "Dockerfile.dev",
          target: "dev",
          args: { NODE_ENV: "development" },
        },
        volumes: [
          {
            type: "volume" as const,
            source: "cache",
            target: "/cache",
            read_only: true,
          },
        ],
        secrets: ["db_password"],
      };

      vi.mocked(findContainer).mockReturnValue(["api", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "docker",
                name: "api",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(
        {
          ...mockConfig,
          volumes: { cache: { name: "shared-cache" } },
          secrets: { db_password: { env: "TEST_DB_PASSWORD" } },
        },
        "test-project",
        projectRoot,
        plan,
      );

      expect(DockerManager.buildImage).toHaveBeenCalledWith({
        context: path.join(projectRoot, "api"),
        dockerfile: path.join(projectRoot, "api", "Dockerfile.dev"),
        target: "dev",
        args: { NODE_ENV: "development" },
        tag: "zap.test-project.api:dev",
      });

      expect(DockerManager.createVolume).toHaveBeenCalledWith("shared-cache");
      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.api",
        expect.objectContaining({
          image: "zap.test-project.api:dev",
          volumes: [
            "shared-cache:/cache:ro",
            `${path.join(projectRoot, ".zap", "secrets", "db_password")}:/run/secrets/db_password:ro`,
          ],
        }),
        {
          projectName: "test-project",
          serviceName: "api",
          configDir: projectRoot,
        },
      );

      delete process.env.TEST_DB_PASSWORD;
      rmSync(projectRoot, { recursive: true, force: true });
    });
  });

  describe("multiple actions", () => {
    it("should execute actions within a wave in parallel", async () => {
      const mockProcess = {
        name: "api",
        cmd: "npm start",
      };

      const mockContainer = mockConfig.docker!.redis;

      vi.mocked(findProcess).mockReturnValue(mockProcess);
      vi.mocked(findContainer).mockReturnValue(["redis", mockContainer]);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
              {
                type: "start",
                serviceType: "docker",
                name: "redis",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(mockNativeProcessExecutor.startProcess).toHaveBeenCalledWith(
        mockProcess,
        "test-project",
      );

      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.redis",
        expect.any(Object),
        {
          projectName: "test-project",
          serviceName: "redis",
          configDir: "/config/dir",
        },
      );
    });
  });

  describe("healthchecks", () => {
    it("should wait for the longest delay healthcheck in a wave", async () => {
      vi.useFakeTimers();
      vi.mocked(findProcess).mockImplementation((_, name) => ({
        name,
        cmd: `npm run ${name}`,
      }));

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "fast",
                healthcheck: { type: "delay", seconds: 1 },
              },
              {
                type: "start",
                serviceType: "native",
                name: "slow",
                healthcheck: { type: "delay", seconds: 5 },
              },
            ],
          },
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "next",
              },
            ],
          },
        ],
      };

      const execution = executeActions(
        mockConfig,
        "test-project",
        "/config/dir",
        plan,
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(mockNativeProcessExecutor.startProcess).toHaveBeenCalledTimes(2);
      expect(mockNativeProcessExecutor.startProcess).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: "next" }),
        "test-project",
      );

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockNativeProcessExecutor.startProcess).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(4000);
      await execution;

      expect(mockNativeProcessExecutor.startProcess).toHaveBeenCalledWith(
        expect.objectContaining({ name: "next" }),
        "test-project",
      );

      vi.useRealTimers();
    });

    it("should poll HTTP healthcheck objects until they pass", async () => {
      vi.mocked(findProcess).mockReturnValue({
        name: "api",
        cmd: "npm start",
      });

      mockFetch
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true });

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: {
                  type: "http",
                  url: "http://localhost:3000/health",
                  timeout: 1,
                  interval: 0.001,
                },
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/config/dir", plan);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/health",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should emit timeout events for HTTP healthcheck objects", async () => {
      vi.mocked(findProcess).mockReturnValue({
        name: "api",
        cmd: "npm start",
      });

      mockFetch.mockResolvedValue({ ok: false });
      const reporter = { onEvent: vi.fn() };

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: {
                  type: "http",
                  url: "http://localhost:3000/health",
                  timeout: 0.001,
                  interval: 0.001,
                },
              },
            ],
          },
        ],
      };

      await executeActions(
        mockConfig,
        "test-project",
        "/config/dir",
        plan,
        reporter,
      );

      expect(reporter.onEvent).toHaveBeenCalledWith({
        type: "service.healthcheck.timeout",
        service: "api",
        healthcheck: "http://localhost:3000/health",
      });
    });
  });

  describe("configuration directory handling", () => {
    it("should handle null config directory", async () => {
      const mockProcess = {
        name: "api",
        cmd: "npm start",
      };

      vi.mocked(findProcess).mockReturnValue(mockProcess);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", null, plan);

      expect(NativeProcessExecutor).toHaveBeenCalledWith(
        "test-project",
        undefined,
        undefined,
      );
    });

    it("should pass config directory to NativeProcessExecutor", async () => {
      const mockProcess = {
        name: "api",
        cmd: "npm start",
      };

      vi.mocked(findProcess).mockReturnValue(mockProcess);

      const plan: ActionPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 0,
              },
            ],
          },
        ],
      };

      await executeActions(mockConfig, "test-project", "/custom/config", plan);

      expect(NativeProcessExecutor).toHaveBeenCalledWith(
        "test-project",
        "/custom/config",
        undefined,
      );
    });
  });
});
