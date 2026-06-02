import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalCommand } from "./GlobalCommand";
import { confirm } from "../utils/confirm";
import { DockerManager } from "../core/docker/DockerManager";
import { Pm2Manager } from "../core/process/Pm2Manager";
import {
  auditSystemResources,
  cleanupSystemResources,
  getStaleSystemRegistryProjects,
  pruneSystemRegistry,
} from "../system";
import type { Zapper } from "../core/Zapper";

vi.mock("../utils/confirm", () => ({
  confirm: vi.fn(),
}));

vi.mock("../system", () => ({
  auditSystemResources: vi.fn(),
  cleanupSystemResources: vi.fn(),
  getStaleSystemRegistryProjects: vi.fn(),
  pruneSystemRegistry: vi.fn(),
}));

const mockedConfirm = vi.mocked(confirm);
const mockedAuditSystemResources = vi.mocked(auditSystemResources);
const mockedCleanupSystemResources = vi.mocked(cleanupSystemResources);

const mockedGetStaleSystemRegistryProjects = vi.mocked(
  getStaleSystemRegistryProjects,
);

const mockedPruneSystemRegistry = vi.mocked(pruneSystemRegistry);

describe("GlobalCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Pm2Manager, "listProcesses").mockResolvedValue([]);
    vi.spyOn(DockerManager, "listContainers").mockResolvedValue([]);
    mockedGetStaleSystemRegistryProjects.mockReturnValue([]);
  });

  it("lists all discovered projects by default", async () => {
    vi.mocked(Pm2Manager.listProcesses).mockResolvedValue([
      {
        name: "zap.alpha.abc123.api",
        pid: 1,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
      },
      {
        name: "zap.beta.def456.worker",
        pid: 2,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
      },
    ]);

    vi.mocked(DockerManager.listContainers).mockResolvedValue([
      {
        id: "container-id",
        name: "zap.alpha.abc123.db",
        status: "running",
        ports: [],
        networks: [],
        created: "",
      },
    ]);

    const loadConfig = vi.fn();

    const result = await new GlobalCommand().execute({
      zapper: { loadConfig } as unknown as Zapper,
      service: ["list"],
      options: {},
    });

    expect(loadConfig).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "global.list",
      allProjects: true,
      projects: [
        {
          name: "alpha",
          prefix: "zap.alpha",
          pm2: ["zap.alpha.abc123.api"],
          containers: ["zap.alpha.abc123.db"],
        },
        {
          name: "beta",
          prefix: "zap.beta",
          pm2: ["zap.beta.def456.worker"],
          containers: [],
        },
      ],
    });
  });

  it("accepts ls as an alias for global list", async () => {
    const result = await new GlobalCommand().execute({
      zapper: {} as Zapper,
      service: ["ls"],
      options: {},
    });

    expect(result).toEqual({
      kind: "global.list",
      allProjects: true,
      projects: [],
    });
  });

  it("cleans orphaned resources before pruning stale registry entries", async () => {
    const removedProject = {
      registryId: "sha256:removed",
      project: "old",
      projectRoot: "/tmp/old",
      configPath: "/tmp/old/zap.yaml",
      statePath: "/tmp/old/.zap/state.json",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      instances: {},
    };

    const orphanedResource = {
      type: "pm2" as const,
      name: "zap.old.abc123.api",
      project: "old",
      instanceId: "abc123",
      service: "api",
      classification: "live-unregistered" as const,
      location: "/tmp/old / instance abc123 / api",
      reason: "No registered project matches this resource name",
    };

    mockedGetStaleSystemRegistryProjects.mockReturnValue([removedProject]);
    mockedPruneSystemRegistry.mockReturnValue([removedProject]);
    mockedAuditSystemResources.mockResolvedValue({
      resources: [orphanedResource],
    });

    mockedCleanupSystemResources.mockResolvedValue({
      resources: [orphanedResource],
    });

    mockedConfirm.mockResolvedValue(true);

    const result = await new GlobalCommand().execute({
      zapper: {} as Zapper,
      service: ["prune"],
      options: { force: true },
    });

    expect(mockedAuditSystemResources.mock.invocationCallOrder[0]).toBeLessThan(
      mockedCleanupSystemResources.mock.invocationCallOrder[0],
    );

    expect(
      mockedCleanupSystemResources.mock.invocationCallOrder[0],
    ).toBeLessThan(mockedPruneSystemRegistry.mock.invocationCallOrder[0]);

    expect(
      mockedGetStaleSystemRegistryProjects.mock.invocationCallOrder[0],
    ).toBeLessThan(mockedAuditSystemResources.mock.invocationCallOrder[0]);

    expect(mockedConfirm).toHaveBeenCalledWith("Delete these resources?", {
      defaultYes: false,
      force: true,
    });

    expect(mockedCleanupSystemResources).toHaveBeenCalledWith({
      includeVolumes: true,
    });

    expect(result).toEqual({
      kind: "global.prune",
      status: "completed",
      staleProjects: [removedProject],
      removedProjects: [removedProject],
      resources: [orphanedResource],
    });
  });

  it("does not clean orphaned resources when prune confirmation is declined", async () => {
    const orphanedResource = {
      type: "volume" as const,
      name: "zap.old.abc123.vol1",
      project: "old",
      instanceId: "abc123",
      classification: "live-unregistered" as const,
      location: "old / instance abc123",
      reason: "No registered project matches this generated volume",
    };

    mockedPruneSystemRegistry.mockReturnValue([]);
    mockedAuditSystemResources.mockResolvedValue({
      resources: [orphanedResource],
    });

    mockedConfirm.mockResolvedValue(false);

    const result = await new GlobalCommand().execute({
      zapper: {} as Zapper,
      service: ["prune"],
      options: {},
    });

    expect(mockedCleanupSystemResources).not.toHaveBeenCalled();
    expect(mockedPruneSystemRegistry).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "global.prune",
      status: "aborted",
      staleProjects: [],
      removedProjects: [],
      resources: [orphanedResource],
    });
  });
});
