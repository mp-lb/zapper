import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockerManager } from "../core/docker/DockerManager";
import { NativeProcessManager } from "../core/process/NativeProcessManager";
import type { Context } from "../types/Context";
import { auditSystemResources } from "./SystemInventory";
import { OrphanScanner } from "./OrphanScanner";
import { PortOrphanScanner } from "./PortOrphanScanner";
import { touchSystemProject } from "./SystemRegistry";

// Keep ancestry checks deterministic: with no parent links, a pid belongs to
// a tree only when it is itself a root.
vi.mock("./processTree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./processTree")>();
  return { ...actual, listLiveParentMap: () => new Map<number, number>() };
});

function makeContext(projectRoot: string): Context {
  return {
    projectName: "registered",
    projectRoot,
    configPath: path.join(projectRoot, "zap.yaml"),
    environments: [],
    instanceKey: "default",
    instanceId: "known123",
    instance: {
      key: "default",
      id: "known123",
      ports: {},
    },
    processes: [],
    containers: [],
    tasks: [],
    links: [],
    profiles: [],
    state: {
      instances: {
        default: {
          id: "known123",
          ports: {},
        },
      },
    },
  };
}

describe("SystemInventory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zapper-system-"));
    vi.stubEnv("ZAPPER_SYSTEM_STATE_HOME", path.join(tempDir, "system"));
    vi.spyOn(NativeProcessManager, "listProcesses").mockResolvedValue([
      {
        name: "zap.unregistered.abc123.api",
        pid: 1,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
      },
      {
        name: "zap.legacy.worker",
        pid: 2,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
      },
    ]);

    vi.spyOn(DockerManager, "listContainers").mockResolvedValue([
      {
        id: "container-id",
        name: "zap.unregistered.abc123.db",
        status: "running",
        ports: [],
        networks: [],
        created: "",
      },
    ]);

    vi.spyOn(DockerManager, "listVolumes").mockResolvedValue([
      { name: "zap.unregistered.abc123.vol1" },
    ]);

    vi.spyOn(OrphanScanner, "listWrapperProcesses").mockReturnValue([]);
    vi.spyOn(PortOrphanScanner, "findOrphanPortListeners").mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports unregistered and legacy Zapper-looking runtime resources", async () => {
    const audit = await auditSystemResources();
    expect(audit.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "nativeProcess",
          name: "zap.unregistered.abc123.api",
          classification: "live-unregistered",
          location: "unregistered / instance abc123 / api",
        }),
        expect.objectContaining({
          type: "nativeProcess",
          name: "zap.legacy.worker",
          classification: "legacy",
        }),
        expect.objectContaining({
          type: "container",
          name: "zap.unregistered.abc123.db",
          classification: "live-unregistered",
        }),
        expect.objectContaining({
          type: "volume",
          name: "zap.unregistered.abc123.vol1",
          classification: "live-unregistered",
        }),
      ]),
    );
  });

  it("treats generated volumes as dangling when the project is registered but the instance ID is not", async () => {
    const projectRoot = path.join(tempDir, "registered");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "zap.yaml"),
      "project: registered\n",
    );

    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });

    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([]);
    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([
      { name: "zap.registered.unknown456.vol1" },
    ]);

    const audit = await auditSystemResources();

    expect(audit.resources).toEqual([
      expect.objectContaining({
        type: "volume",
        name: "zap.registered.unknown456.vol1",
        classification: "dangling",
        location: expect.stringContaining("registered / instance unknown456"),
      }),
    ]);
  });

  it("does not flag live resources as dangling when the owning project fails to load", async () => {
    const projectRoot = path.join(tempDir, "registered");
    fs.mkdirSync(projectRoot, { recursive: true });
    const context = makeContext(projectRoot);
    // Register the project, then leave its config in a state that cannot load.
    // The config path still exists (so the project is "unresolved", not
    // "stale"), but parsing throws, so we never learn its current services.
    fs.writeFileSync(
      path.join(projectRoot, "zap.yaml"),
      "project: registered\n",
    );

    touchSystemProject({ context, configPath: context.configPath! });
    fs.writeFileSync(
      path.join(projectRoot, "zap.yaml"),
      "project: [unclosed\n",
    );

    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([
      {
        name: "zap.registered.known123.api",
        pid: 1,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
      },
    ]);

    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    const audit = await auditSystemResources();

    // The running service belongs to a known, registered instance whose config
    // simply could not be parsed right now. It must not be offered for pruning.
    expect(
      audit.resources.find((r) => r.name === "zap.registered.known123.api"),
    ).toBeUndefined();

    expect(audit.resources).toEqual([]);
  });

  it("flags native processes whose working directory no longer exists as dangling", async () => {
    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([
      {
        name: "zap.anyproject.gone123.api",
        pid: 11,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
        cwd: path.join(tempDir, "deleted-instance"),
      },
    ]);

    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    const audit = await auditSystemResources();

    expect(audit.resources).toEqual([
      expect.objectContaining({
        type: "nativeProcess",
        name: "zap.anyproject.gone123.api",
        classification: "dangling",
        reason: "Process working directory no longer exists",
      }),
    ]);
  });

  it("flags supervisor registrations whose wrapper script no longer exists as dangling", async () => {
    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([
      {
        name: "zap.anyproject.gone456.api",
        pid: 12,
        status: "errored",
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 162000,
        cwd: tempDir,
        script: path.join(tempDir, "deleted", ".zap", "proj.api.123.sh"),
      },
    ]);

    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    const audit = await auditSystemResources();

    expect(audit.resources).toEqual([
      expect.objectContaining({
        type: "nativeProcess",
        name: "zap.anyproject.gone456.api",
        classification: "dangling",
        reason:
          "Wrapper script no longer exists; the registration can only crash-loop",
      }),
    ]);
  });

  it("reports processes holding zap-assigned ports that are unknown to the supervisor", async () => {
    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([]);
    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    vi.mocked(PortOrphanScanner.findOrphanPortListeners).mockReturnValue([
      {
        project: "someproj",
        instanceKey: "default",
        instanceId: "abc123",
        portName: "API_PORT",
        port: 51234,
        pid: 4242,
        command: "node",
      },
    ]);

    const audit = await auditSystemResources();

    expect(audit.resources).toEqual([
      expect.objectContaining({
        type: "process",
        pid: 4242,
        project: "someproj",
        classification: "dangling",
        reason: expect.stringContaining("port 51234"),
      }),
    ]);
  });

  it("flags non-supervisor wrapper processes whose script is gone, skipping live scripts and supervisor-managed pids", async () => {
    const liveScript = path.join(tempDir, ".zap", "proj.svc.111.sh");
    fs.mkdirSync(path.dirname(liveScript), { recursive: true });
    fs.writeFileSync(liveScript, "#!/bin/bash\n");

    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([]);
    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    vi.mocked(OrphanScanner.listWrapperProcesses).mockReturnValue([
      { pid: 100, scriptPath: "/gone/dir/.zap/proj.svc.222.sh" },
      { pid: 200, scriptPath: liveScript },
    ]);

    const audit = await auditSystemResources();

    expect(audit.resources).toEqual([
      expect.objectContaining({
        type: "process",
        pid: 100,
        classification: "dangling",
        location: "/gone/dir/.zap/proj.svc.222.sh",
      }),
    ]);
  });

  it("does not report a wrapper pid that supervisor still manages", async () => {
    vi.mocked(NativeProcessManager.listProcesses).mockResolvedValue([
      {
        name: "zap.unregistered.abc123.api",
        pid: 300,
        status: "online",
        uptime: 100,
        memory: 1,
        cpu: 0,
        restarts: 0,
        cwd: tempDir,
      },
    ]);

    vi.mocked(DockerManager.listContainers).mockResolvedValue([]);
    vi.mocked(DockerManager.listVolumes).mockResolvedValue([]);

    vi.mocked(OrphanScanner.listWrapperProcesses).mockReturnValue([
      { pid: 300, scriptPath: "/gone/dir/.zap/proj.svc.333.sh" },
    ]);

    const audit = await auditSystemResources();

    expect(audit.resources.filter((r) => r.type === "process")).toEqual([]);
  });
});
