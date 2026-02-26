/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeActions } from "./executeActions";
import { ZapperConfig } from "../utils";
import { DockerManager } from "./docker";
import { Pm2Executor } from "./process/Pm2Executor";
import { ActionPlan } from "../types";
import { findProcess } from "./findProcess";
import { findContainer } from "./findContainer";

vi.mock("./docker");
vi.mock("./findProcess");
vi.mock("./findContainer");
vi.mock("../config/stateLoader", () => ({
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

vi.mock("./process/Pm2Executor", () => {
  return {
    Pm2Executor: vi.fn(),
  };
});

describe("executeActions", () => {
  let mockConfig: ZapperConfig;
  let mockPm2Executor: {
    startProcess: ReturnType<typeof vi.fn>;
    stopProcess: ReturnType<typeof vi.fn>;
    restartProcess: ReturnType<typeof vi.fn>;
    showLogs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

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

    mockPm2Executor = {
      startProcess: vi.fn().mockResolvedValue(undefined),
      stopProcess: vi.fn().mockResolvedValue(undefined),
      restartProcess: vi.fn().mockResolvedValue(undefined),
      showLogs: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(Pm2Executor).mockImplementation(() => mockPm2Executor as any);

    vi.mocked(DockerManager.createVolume).mockResolvedValue(undefined);
    vi.mocked(DockerManager.startContainerAsync).mockResolvedValue(12345);
    vi.mocked(DockerManager.stopContainer).mockResolvedValue(undefined);
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
      expect(mockPm2Executor.startProcess).toHaveBeenCalledWith(
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
      expect(mockPm2Executor.stopProcess).toHaveBeenCalledWith("worker");
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
          },
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
          },
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
      );
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

      expect(mockPm2Executor.startProcess).toHaveBeenCalledWith(
        mockProcess,
        "test-project",
      );
      expect(DockerManager.startContainerAsync).toHaveBeenCalledWith(
        "zap.test-project.redis",
        expect.any(Object),
      );
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

      expect(Pm2Executor).toHaveBeenCalledWith(
        "test-project",
        undefined,
        undefined,
      );
    });

    it("should pass config directory to Pm2Executor", async () => {
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

      expect(Pm2Executor).toHaveBeenCalledWith(
        "test-project",
        "/custom/config",
        undefined,
      );
    });
  });
});
