import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServiceList } from "./getServiceList";
import { getStatus } from "./getStatus";
import type { Context } from "../types/Context";
import { Pm2Manager } from "./process/Pm2Manager";
import { DockerManager } from "./docker";

vi.mock("./getStatus", () => ({
  getStatus: vi.fn(),
}));

vi.mock("./process/Pm2Manager");
vi.mock("./docker");

const mockedGetStatus = vi.mocked(getStatus);
const mockedPm2Manager = vi.mocked(Pm2Manager);
const mockedDockerManager = vi.mocked(DockerManager);

function createContext(): Context {
  return {
    projectName: "demo",
    projectRoot: "/tmp/demo",
    envFiles: [],
    environments: [],
    instanceKey: "default",
    instance: {
      key: "default",
      id: "abc123",
      ports: {
        DB_PORT: "15432",
      },
      volumes: {
        "zap.demo.abc123.vol1": {
          service: "db",
          internal_dir: "/var/lib/postgresql/data",
        },
        "zap.demo.abc123.vol2": {
          service: "old-db",
          internal_dir: "/data",
        },
      },
    },
    ports: ["API_PORT", "WEB_PORT"],
    processes: [
      {
        name: "api",
        aliases: ["backend"],
        cmd: "pnpm dev",
        cwd: "./apps/api",
        resolvedEnv: { API_PORT: "3001" },
      },
      {
        name: "worker",
        cmd: "pnpm worker",
      },
    ],
    containers: [
      {
        name: "db",
        aliases: ["postgres"],
        image: "postgres:16",
        ports: ["$DB_PORT:5432"],
        volumes: ["/var/lib/postgresql/data:ro", "db-logs:/var/log/postgresql"],
      },
      {
        name: "cache",
        image: "redis:7",
        command: ["redis-server", "--appendonly", "yes"],
      },
    ],
    tasks: [],
    links: [],
    profiles: [],
    state: {
      instances: {
        default: {
          id: "abc123",
          volumes: {
            "zap.demo.abc123.vol1": {
              service: "db",
              internal_dir: "/var/lib/postgresql/data",
            },
            "zap.demo.abc123.vol2": {
              service: "old-db",
              internal_dir: "/data",
            },
          },
        },
      },
    },
  };
}

describe("getServiceList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPm2Manager.listProcesses.mockResolvedValue([]);
    mockedDockerManager.listContainers.mockResolvedValue([]);
    mockedDockerManager.listVolumes.mockResolvedValue([]);
  });

  it("returns native and docker entries with details", async () => {
    mockedGetStatus.mockResolvedValue({
      native: [
        {
          service: "api",
          rawName: "zap.demo.api",
          status: "up",
          type: "native",
          enabled: true,
        },
      ],
      docker: [
        {
          service: "db",
          rawName: "zap.demo.db",
          status: "pending",
          type: "docker",
          enabled: true,
        },
      ],
    });

    const result = await getServiceList(createContext());

    expect(result.services).toEqual([
      {
        type: "native",
        service: "api",
        status: "up",
        enabled: true,
        ports: ["API_PORT=3001"],
        volumes: [],
        cwd: "./apps/api",
        cmd: "pnpm dev",
      },
      {
        type: "native",
        service: "worker",
        status: "down",
        enabled: true,
        ports: [],
        volumes: [],
        cwd: undefined,
        cmd: "pnpm worker",
      },
      {
        type: "docker",
        service: "db",
        status: "pending",
        enabled: true,
        ports: ["15432:5432"],
        volumes: [
          "zap.demo.abc123.vol1:/var/lib/postgresql/data:ro",
          "db-logs:/var/log/postgresql",
        ],
        cmd: "postgres:16",
      },
      {
        type: "docker",
        service: "cache",
        status: "down",
        enabled: true,
        ports: [],
        volumes: [],
        cmd: "redis-server --appendonly yes",
      },
    ]);

    expect(result.ports).toEqual([
      { name: "API_PORT", value: "" },
      { name: "WEB_PORT", value: "" },
    ]);

    expect(result.resources).toBeUndefined();
  });

  it("reports project-shaped dangling and alien resources", async () => {
    mockedGetStatus.mockResolvedValue({ native: [], docker: [] });
    mockedPm2Manager.listProcesses.mockResolvedValue([
      {
        name: "zap.demo.abc123.old-api",
        pid: 1,
        status: "online",
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
      },
      {
        name: "zap.demo.zz9999.api",
        pid: 2,
        status: "online",
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
      },
    ]);

    mockedDockerManager.listContainers.mockResolvedValue([
      {
        id: "1",
        name: "zap.demo.abc123.old-db",
        status: "Up",
        ports: [],
        networks: [],
        created: "",
      },
    ]);

    mockedDockerManager.listVolumes.mockResolvedValue([
      { name: "zap.demo.abc123.vol99" },
      { name: "zap.demo.zz9999.vol1" },
    ]);

    const result = await getServiceList(createContext(), undefined, {
      extended: true,
    });

    expect(result.resources?.dangling).toEqual([
      {
        type: "pm2",
        name: "zap.demo.abc123.old-api",
        reason: 'service "old-api" is not in current zap.yaml',
      },
      {
        type: "container",
        name: "zap.demo.abc123.old-db",
        reason: 'service "old-db" is not in current zap.yaml',
      },
      {
        type: "volume",
        name: "zap.demo.abc123.vol2",
        reason: "old-db:/data is not in current zap.yaml",
      },
      {
        type: "volume",
        name: "zap.demo.abc123.vol99",
        reason: "Docker volume is not tracked in current repo state",
      },
    ]);

    expect(result.resources?.alien).toEqual([
      {
        type: "pm2",
        name: "zap.demo.zz9999.api",
        reason: "instance not in this repo state",
      },
      {
        type: "volume",
        name: "zap.demo.zz9999.vol1",
        reason: "instance not in this repo state",
      },
    ]);
  });

  it("filters results by services", async () => {
    mockedGetStatus.mockResolvedValue({ native: [], docker: [] });

    const result = await getServiceList(createContext(), ["api", "db"]);

    expect(result.services.map((service) => service.service)).toEqual([
      "api",
      "db",
    ]);

    expect(mockedGetStatus).toHaveBeenCalledWith(
      createContext(),
      ["api", "db"],
      false,
    );

    expect(result.resources).toBeUndefined();
  });

  it("filters results by aliases through canonical service targets", async () => {
    mockedGetStatus.mockResolvedValue({ native: [], docker: [] });

    const result = await getServiceList(createContext(), [
      "backend",
      "postgres",
    ]);

    expect(result.services.map((service) => service.service)).toEqual([
      "api",
      "db",
    ]);

    expect(mockedGetStatus).toHaveBeenCalledWith(
      createContext(),
      ["api", "db"],
      false,
    );
  });
});
