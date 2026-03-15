import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServiceList } from "./getServiceList";
import { getStatus } from "./getStatus";
import type { Context } from "../types/Context";

vi.mock("./getStatus", () => ({
  getStatus: vi.fn(),
}));

const mockedGetStatus = vi.mocked(getStatus);

function createContext(): Context {
  return {
    projectName: "demo",
    projectRoot: "/tmp/demo",
    envFiles: [],
    environments: [],
    instanceKey: "default",
    ports: ["API_PORT", "WEB_PORT"],
    processes: [
      {
        name: "api",
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
        image: "postgres:16",
        ports: ["$DB_PORT:5432"],
      },
      {
        name: "cache",
        image: "redis:7",
        command: "redis-server --appendonly yes",
      },
    ],
    tasks: [],
    links: [],
    profiles: [],
    state: {
      ports: {
        DB_PORT: "15432",
      },
    },
  };
}

describe("getServiceList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        ports: ["API_PORT=3001"],
        cwd: "./apps/api",
        cmd: "pnpm dev",
      },
      {
        type: "native",
        service: "worker",
        status: "down",
        ports: [],
        cwd: undefined,
        cmd: "pnpm worker",
      },
      {
        type: "docker",
        service: "db",
        status: "pending",
        ports: ["15432:5432"],
        cmd: "postgres:16",
      },
      {
        type: "docker",
        service: "cache",
        status: "down",
        ports: [],
        cmd: "redis-server --appendonly yes",
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
    expect(mockedGetStatus).toHaveBeenCalledWith(createContext(), ["api", "db"], false);
  });
});
