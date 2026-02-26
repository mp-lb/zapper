import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectKillTargets, Zapper } from "./Zapper";
import { Planner } from "./Planner";
import { executeActions } from "./executeActions";
import { Pm2Manager } from "./process/Pm2Manager";
import { DockerManager } from "./docker";
import { ContextNotLoadedError, ServiceNotFoundError } from "../errors";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { parseYamlFile } from "../config/yamlParser";

// Mock external dependencies
vi.mock("./Planner");
vi.mock("./executeActions");
vi.mock("./process/Pm2Manager");
vi.mock("./docker");
vi.mock("../config/yamlParser");

const mockPlanner = vi.mocked(Planner);
const mockExecuteActions = vi.mocked(executeActions);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockPm2Manager = vi.mocked(Pm2Manager);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockDockerManager = vi.mocked(DockerManager);

// Mock parseYamlFile
const mockParseYamlFile = vi.mocked(parseYamlFile);

describe("Zapper", () => {
  let zapper: Zapper;
  let tempDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    zapper = new Zapper();

    // Create a unique temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(tmpdir(), "zapper-test-"));

    // Default mock for parseYamlFile
    mockParseYamlFile.mockReturnValue({
      project: "test-project",
      native: {
        api: { cmd: "npm start" },
        frontend: { cmd: "npm run dev" },
      },
      docker: {
        database: { image: "postgres:15" },
      },
    });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTempConfig(config: object, filename = "zap.yaml"): string {
    const configPath = path.join(tempDir, filename);
    const yamlContent = `project: test-project
native:
  api:
    cmd: npm start
  frontend:
    cmd: npm run dev
docker:
  database:
    image: postgres:15
`;
    fs.writeFileSync(configPath, yamlContent);
    return configPath;
  }

  function createMinimalTempConfig(projectName = "test-project"): string {
    const configPath = path.join(tempDir, "zap.yaml");
    const yamlContent = `project: ${projectName}
native:
  api:
    cmd: npm start`;
    fs.writeFileSync(configPath, yamlContent);
    return configPath;
  }

  describe("loadConfig", () => {
    it("should resolve config path and set projectRoot correctly", async () => {
      const configPath = createTempConfig({});

      await zapper.loadConfig(configPath);

      expect(zapper.getProject()).toBe("test-project");
      expect(zapper.getProjectRoot()).toBe(tempDir);
      expect(zapper.getContext()).not.toBeNull();
    });

    it("should throw when no config found with custom path", async () => {
      const nonExistentPath = path.join(tempDir, "nonexistent.yaml");

      await expect(zapper.loadConfig(nonExistentPath)).rejects.toThrow(
        `Config file not found: ${nonExistentPath}`,
      );
    });

    it("should throw when no config found without custom path", async () => {
      // Test the case where no configPath is provided and no config is found
      await expect(zapper.loadConfig()).rejects.toThrow(
        "No zap.yaml config file found in current directory or parent directories",
      );
    });

    it("should throw for invalid config path (directory that doesn't contain config)", async () => {
      const emptyDir = path.join(tempDir, "empty");
      fs.mkdirSync(emptyDir);

      // When a directory is provided that doesn't contain a config file,
      // resolveConfigPath will search in that directory and return null
      await expect(zapper.loadConfig(emptyDir)).rejects.toThrow(
        /config file found|Config file not found/,
      );
    });

    it("should apply CLI override for http git method", async () => {
      const configPath = createMinimalTempConfig();
      mockParseYamlFile.mockReturnValue({
        project: "test-project",
        native: { api: { cmd: "npm start" } },
      });

      await zapper.loadConfig(configPath, { http: true });

      const context = zapper.getContext();
      expect(context?.gitMethod).toBe("http");
    });

    it("should apply CLI override for ssh git method", async () => {
      const configPath = createMinimalTempConfig();
      mockParseYamlFile.mockReturnValue({
        project: "test-project",
        native: { api: { cmd: "npm start" } },
      });

      await zapper.loadConfig(configPath, { ssh: true });

      const context = zapper.getContext();
      expect(context?.gitMethod).toBe("ssh");
    });

    it("should throw error when both http and ssh options provided", async () => {
      const configPath = createMinimalTempConfig();
      mockParseYamlFile.mockReturnValue({
        project: "test-project",
        native: { api: { cmd: "npm start" } },
      });

      await expect(
        zapper.loadConfig(configPath, { http: true, ssh: true }),
      ).rejects.toThrow("Cannot specify both --http and --ssh options");
    });

    it("should not modify git method when no CLI overrides provided", async () => {
      const configPath = createMinimalTempConfig();
      mockParseYamlFile.mockReturnValue({
        project: "test-project",
        native: { api: { cmd: "npm start" } },
      });

      await zapper.loadConfig(configPath);

      const context = zapper.getContext();
      expect(context?.gitMethod).toBeUndefined();
    });
  });

  describe("getter methods before loadConfig", () => {
    it("should return null for getProject before config loaded", () => {
      expect(zapper.getProject()).toBeNull();
    });

    it("should return null for getProjectRoot before config loaded", () => {
      expect(zapper.getProjectRoot()).toBeNull();
    });

    it("should return null for getContext before config loaded", () => {
      expect(zapper.getContext()).toBeNull();
    });
  });

  describe("resolveServiceName", () => {
    beforeEach(async () => {
      const configPath = createTempConfig({});
      await zapper.loadConfig(configPath);
    });

    it("should resolve service aliases to canonical names", () => {
      // Mock the context to have aliases
      const context = zapper.getContext();
      if (context) {
        context.processes = [
          { name: "api", cmd: "npm start", aliases: ["backend", "server"] },
          { name: "frontend", cmd: "npm run dev", aliases: ["web"] },
        ];
        context.containers = [
          {
            name: "database",
            image: "postgres:15",
            aliases: ["db", "postgres"],
          },
        ];
      }

      expect(zapper.resolveServiceName("backend")).toBe("api");
      expect(zapper.resolveServiceName("server")).toBe("api");
      expect(zapper.resolveServiceName("web")).toBe("frontend");
      expect(zapper.resolveServiceName("db")).toBe("database");
      expect(zapper.resolveServiceName("postgres")).toBe("database");
      expect(zapper.resolveServiceName("api")).toBe("api"); // Should return itself
      expect(zapper.resolveServiceName("nonexistent")).toBe("nonexistent"); // Unknown alias
    });
  });

  describe("methods that require loaded context", () => {
    const contextRequiredMethods = [
      { name: "startProcesses", args: [] },
      { name: "stopProcesses", args: [] },
      { name: "restartProcesses", args: [] },
      { name: "showLogs", args: ["api"] },
      { name: "reset", args: [] },
      { name: "cloneRepos", args: [] },
      { name: "runTask", args: ["task1"] },
      { name: "gitCheckoutAll", args: ["main"] },
      { name: "gitPullAll", args: [] },
      { name: "gitStatusAll", args: [] },
      { name: "gitStashAll", args: [] },
    ];

    contextRequiredMethods.forEach(({ name, args }) => {
      it(`should throw ContextNotLoadedError when ${name} called before loadConfig`, async () => {
        await expect(
          (zapper as Record<string, (...args: unknown[]) => Promise<unknown>>)[
            name
          ](...args),
        ).rejects.toThrow(ContextNotLoadedError);
      });
    });
  });

  describe("orchestration methods", () => {
    let mockPlannerInstance: { getPlan: () => unknown };
    let mockPlan: unknown;

    beforeEach(async () => {
      const configPath = createTempConfig({});
      await zapper.loadConfig(configPath);

      mockPlan = {
        waves: [
          {
            actions: [
              {
                type: "start",
                serviceType: "native",
                name: "api",
                healthcheck: 5,
              },
            ],
          },
        ],
      };

      mockPlannerInstance = {
        plan: vi.fn().mockResolvedValue(mockPlan),
      };
      mockPlanner.mockImplementation(() => mockPlannerInstance);
      mockExecuteActions.mockResolvedValue(undefined);
    });

    describe("startProcesses", () => {
      it("should call Planner and executeActions with correct projectName and projectRoot", async () => {
        await zapper.startProcesses();

        expect(mockPlanner).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "test-project",
          }),
        );

        expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
          "start",
          undefined,
          "test-project",
          false,
          undefined,
        );

        expect(mockExecuteActions).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "test-project",
          }),
          "test-project",
          tempDir,
          mockPlan,
        );
      });

      it("should resolve aliases and pass to planner", async () => {
        const context = zapper.getContext();
        if (context) {
          context.processes = [
            { name: "api", cmd: "npm start", aliases: ["backend"] },
          ];
        }

        await zapper.startProcesses(["backend"]);

        expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
          "start",
          ["api"], // Should resolve "backend" to "api"
          "test-project",
          false,
          undefined,
        );
      });

      it("should throw ServiceNotFoundError when no processes defined", async () => {
        const context = zapper.getContext();
        if (context) {
          context.processes = [];
          context.containers = [];
        }

        await expect(zapper.startProcesses()).rejects.toThrow(
          ServiceNotFoundError,
        );
      });

      it("should throw ServiceNotFoundError when specific process not found", async () => {
        mockPlan.waves = []; // No actions planned

        await expect(zapper.startProcesses(["nonexistent"])).rejects.toThrow(
          ServiceNotFoundError,
        );
      });
    });

    describe("stopProcesses", () => {
      it("should plan stop actions with correct parameters", async () => {
        await zapper.stopProcesses(["api"]);

        expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
          "stop",
          ["api"],
          "test-project",
          false,
          undefined,
        );

        expect(mockExecuteActions).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "test-project",
          }),
          "test-project",
          tempDir,
          mockPlan,
        );
      });

      it("should throw ServiceNotFoundError when no actions planned for specific services", async () => {
        mockPlan.waves = []; // No actions planned

        await expect(zapper.stopProcesses(["nonexistent"])).rejects.toThrow(
          ServiceNotFoundError,
        );
      });
    });

    describe("restartProcesses", () => {
      it("should plan restart actions with correct parameters", async () => {
        await zapper.restartProcesses(["api"]);

        expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
          "restart",
          ["api"],
          "test-project",
          false,
          undefined,
        );

        expect(mockExecuteActions).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "test-project",
          }),
          "test-project",
          tempDir,
          mockPlan,
        );
      });

      it("should work without specific process names", async () => {
        await zapper.restartProcesses();

        expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
          "restart",
          undefined,
          "test-project",
          false,
          undefined,
        );
      });
    });
  });

  describe("killProjectResources", () => {
    beforeEach(async () => {
      const configPath = createTempConfig({});
      await zapper.loadConfig(configPath);
    });

    it("discovers PM2 processes and containers by project prefix", async () => {
      (
        Pm2Manager.listProcesses as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          name: "zap.test-project.api",
          pid: 100,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
        {
          name: "zap.test-project.dev.worker",
          pid: 101,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
        {
          name: "zap.other.api",
          pid: 102,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
      ]);

      (
        DockerManager.listContainers as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: "1",
          name: "zap.test-project.redis",
          status: "Up 1 minute",
          ports: [],
          networks: [],
          created: "",
        },
        {
          id: "2",
          name: "zap.other.redis",
          status: "Up 1 minute",
          ports: [],
          networks: [],
          created: "",
        },
      ]);

      const targets = await zapper.getProjectKillTargets();

      expect(targets).toEqual({
        projectName: "test-project",
        prefix: "zap.test-project",
        pm2: ["zap.test-project.api", "zap.test-project.dev.worker"],
        containers: ["zap.test-project.redis"],
      });
    });

    it("deletes discovered targets from PM2 and Docker", async () => {
      const deleteProcessMock = vi
        .spyOn(Pm2Manager, "deleteProcess")
        .mockResolvedValue(undefined);
      const removeContainerMock = vi
        .spyOn(DockerManager, "removeContainer")
        .mockResolvedValue(undefined);

      const targets: ProjectKillTargets = {
        projectName: "test-project",
        prefix: "zap.test-project",
        pm2: ["zap.test-project.api", "zap.test-project.worker"],
        containers: ["zap.test-project.redis"],
      };

      const result = await zapper.killProjectResources(targets);

      expect(deleteProcessMock).toHaveBeenNthCalledWith(
        1,
        "zap.test-project.api",
      );
      expect(deleteProcessMock).toHaveBeenNthCalledWith(
        2,
        "zap.test-project.worker",
      );
      expect(removeContainerMock).toHaveBeenCalledWith(
        "zap.test-project.redis",
      );
      expect(result).toEqual(targets);
    });
  });

  describe("killProjectResources with explicit project name", () => {
    it("discovers targets without loading config", async () => {
      const unloadedZapper = new Zapper();

      (
        Pm2Manager.listProcesses as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          name: "zap.legacy.api",
          pid: 100,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
        {
          name: "zap.other.api",
          pid: 102,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
      ]);

      (
        DockerManager.listContainers as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: "1",
          name: "zap.legacy.redis",
          status: "Up 1 minute",
          ports: [],
          networks: [],
          created: "",
        },
        {
          id: "2",
          name: "zap.other.redis",
          status: "Up 1 minute",
          ports: [],
          networks: [],
          created: "",
        },
      ]);

      const targets = await unloadedZapper.getProjectKillTargets("legacy");

      expect(targets).toEqual({
        projectName: "legacy",
        prefix: "zap.legacy",
        pm2: ["zap.legacy.api"],
        containers: ["zap.legacy.redis"],
      });
    });

    it("kills explicit project resources without loading config", async () => {
      const unloadedZapper = new Zapper();
      const deleteProcessMock = vi
        .spyOn(Pm2Manager, "deleteProcess")
        .mockResolvedValue(undefined);
      const removeContainerMock = vi
        .spyOn(DockerManager, "removeContainer")
        .mockResolvedValue(undefined);

      (
        Pm2Manager.listProcesses as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          name: "zap.legacy.api",
          pid: 100,
          status: "online",
          uptime: 1000,
          memory: 100,
          cpu: 1,
          restarts: 0,
        },
      ]);

      (
        DockerManager.listContainers as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: "1",
          name: "zap.legacy.redis",
          status: "Up 1 minute",
          ports: [],
          networks: [],
          created: "",
        },
      ]);

      const result = await unloadedZapper.killProjectResources(
        undefined,
        "legacy",
      );

      expect(deleteProcessMock).toHaveBeenCalledWith("zap.legacy.api");
      expect(removeContainerMock).toHaveBeenCalledWith("zap.legacy.redis");
      expect(result).toEqual({
        projectName: "legacy",
        prefix: "zap.legacy",
        pm2: ["zap.legacy.api"],
        containers: ["zap.legacy.redis"],
      });
    });

    it("throws when no config is loaded and no project name is provided", async () => {
      const unloadedZapper = new Zapper();
      await expect(unloadedZapper.getProjectKillTargets()).rejects.toThrow(
        "No project name provided. Run from a project with zap.yaml or pass one explicitly: zap kill <project>",
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete workflow: loadConfig -> start -> stop", async () => {
      const configPath = createTempConfig({});

      // Load config
      await zapper.loadConfig(configPath);
      expect(zapper.getProject()).toBe("test-project");
      expect(zapper.getProjectRoot()).toBe(tempDir);

      // Setup mocks for orchestration
      const mockPlannerInstance = {
        plan: vi.fn().mockResolvedValue({
          waves: [
            {
              actions: [
                {
                  type: "start",
                  serviceType: "native",
                  name: "api",
                  healthcheck: 5,
                },
              ],
            },
          ],
        }),
      };
      mockPlanner.mockImplementation(() => mockPlannerInstance);
      mockExecuteActions.mockResolvedValue(undefined);

      // Start processes
      await zapper.startProcesses(["api"]);
      expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
        "start",
        ["api"],
        "test-project",
        false,
        undefined,
      );

      // Stop processes
      await zapper.stopProcesses(["api"]);
      expect(mockPlannerInstance.plan).toHaveBeenCalledWith(
        "stop",
        ["api"],
        "test-project",
        false,
        undefined,
      );
    });

    it("should handle config with custom project name", async () => {
      const configPath = createMinimalTempConfig("my-custom-project");
      mockParseYamlFile.mockReturnValue({
        project: "my-custom-project",
        native: { api: { cmd: "npm start" } },
      });

      await zapper.loadConfig(configPath);

      expect(zapper.getProject()).toBe("my-custom-project");
      expect(zapper.getContext()?.projectName).toBe("my-custom-project");
    });

    it("should preserve context state between method calls", async () => {
      const configPath = createTempConfig({});
      await zapper.loadConfig(configPath);

      const context1 = zapper.getContext();
      const project1 = zapper.getProject();
      const root1 = zapper.getProjectRoot();

      // Call another method that requires context
      const resolved = zapper.resolveServiceName("api");

      // Verify context hasn't changed
      expect(zapper.getContext()).toBe(context1);
      expect(zapper.getProject()).toBe(project1);
      expect(zapper.getProjectRoot()).toBe(root1);
      expect(resolved).toBe("api");
    });
  });

  describe("error handling", () => {
    it("should handle malformed YAML gracefully", async () => {
      const configPath = path.join(tempDir, "zap.yaml");
      fs.writeFileSync(configPath, "invalid: yaml: content: [unclosed");

      // Mock parseYamlFile to throw an error for this specific test
      mockParseYamlFile.mockImplementationOnce(() => {
        throw new Error("YAML parsing failed");
      });

      await expect(zapper.loadConfig(configPath)).rejects.toThrow();
    });

    it("should handle directory permissions", async () => {
      // This test may need to be skipped on some systems due to permission requirements
      const restrictedDir = path.join(tempDir, "restricted");
      fs.mkdirSync(restrictedDir);

      try {
        fs.chmodSync(restrictedDir, 0o000); // No permissions
        await expect(zapper.loadConfig(restrictedDir)).rejects.toThrow();
      } catch (error) {
        // Skip test if we can't change permissions (e.g., Windows)
        if ((error as { code?: string }).code !== "EPERM") {
          throw error;
        }
      } finally {
        try {
          fs.chmodSync(restrictedDir, 0o755); // Restore permissions for cleanup
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });
});
