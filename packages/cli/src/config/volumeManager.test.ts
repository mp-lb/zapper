import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadState } from "./stateLoader";
import { savePortsForInstance } from "./portsManager";
import {
  findStaleManagedVolumes,
  getServiceDockerVolumes,
  initializeManagedVolumes,
  resetManagedVolumesForInstance,
  resolveContainerVolumes,
} from "./volumeManager";

describe("volumeManager", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function makeTempDir(): string {
    tempDir = mkdtempSync(path.join(tmpdir(), "zapper-volumes-"));
    return tempDir;
  }

  it("assigns short sequential volume names per instance", () => {
    const projectRoot = makeTempDir();

    const volumes = initializeManagedVolumes(
      projectRoot,
      "myproject",
      "default",
      "abc123",
      [
        { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
        { serviceName: "redis", internalDir: "/data" },
      ],
    );

    expect(volumes).toEqual({
      "postgres:/var/lib/postgresql/data": "zap.myproject.abc123.vol1",
      "redis:/data": "zap.myproject.abc123.vol2",
    });

    expect(loadState(projectRoot).instances?.default?.volumes).toEqual({
      "zap.myproject.abc123.vol1": {
        service: "postgres",
        internal_dir: "/var/lib/postgresql/data",
      },
      "zap.myproject.abc123.vol2": {
        service: "redis",
        internal_dir: "/data",
      },
    });
  });

  it("preserves existing assignments and allocates the next index", () => {
    const projectRoot = makeTempDir();

    initializeManagedVolumes(projectRoot, "myproject", "default", "abc123", [
      { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
    ]);

    const volumes = initializeManagedVolumes(
      projectRoot,
      "myproject",
      "default",
      "abc123",
      [
        { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
        { serviceName: "mongodb", internalDir: "/data/db" },
      ],
    );

    expect(volumes).toEqual({
      "postgres:/var/lib/postgresql/data": "zap.myproject.abc123.vol1",
      "mongodb:/data/db": "zap.myproject.abc123.vol2",
    });
  });

  it("starts numbering from one for a separate instance", () => {
    const projectRoot = makeTempDir();

    initializeManagedVolumes(projectRoot, "myproject", "default", "abc123", [
      { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
    ]);

    const otherVolumes = initializeManagedVolumes(
      projectRoot,
      "myproject",
      "other",
      "def456",
      [{ serviceName: "postgres", internalDir: "/var/lib/postgresql/data" }],
    );

    expect(otherVolumes).toEqual({
      "postgres:/var/lib/postgresql/data": "zap.myproject.def456.vol1",
    });
  });

  it("preserves sibling instance state when saving managed volumes", () => {
    const projectRoot = makeTempDir();

    savePortsForInstance(projectRoot, "default", { API_PORT: "51234" });
    const existingId = loadState(projectRoot).instances?.default?.id;

    initializeManagedVolumes(projectRoot, "myproject", "default", "abc123", [
      { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
    ]);

    expect(loadState(projectRoot).instances?.default).toMatchObject({
      id: existingId,
      ports: { API_PORT: "51234" },
      volumes: {
        "zap.myproject.abc123.vol1": {
          service: "postgres",
          internal_dir: "/var/lib/postgresql/data",
        },
      },
    });
  });

  it("finds stale volumes and can reset managed assignments", () => {
    const projectRoot = makeTempDir();

    initializeManagedVolumes(projectRoot, "myproject", "default", "abc123", [
      { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
      { serviceName: "mongodb", internalDir: "/data/db" },
    ]);

    expect(
      findStaleManagedVolumes(projectRoot, "default", [
        { serviceName: "postgres", internalDir: "/var/lib/postgresql/data" },
      ]),
    ).toEqual({
      "zap.myproject.abc123.vol2": {
        service: "mongodb",
        internal_dir: "/data/db",
      },
    });

    const reset = resetManagedVolumesForInstance(projectRoot, "default");
    expect(Object.keys(reset)).toEqual([
      "zap.myproject.abc123.vol1",
      "zap.myproject.abc123.vol2",
    ]);

    expect(loadState(projectRoot).instances?.default?.volumes).toEqual({});
  });

  it("returns Docker volumes for a service without bind mounts", () => {
    const volumes = getServiceDockerVolumes(
      "postgres",
      [
        "/var/lib/postgresql/data",
        "postgres-logs:/var/log/postgresql:ro",
        "./init.sql:/docker-entrypoint-initdb.d/init.sql",
        { name: "postgres-config", internal_dir: "/etc/postgresql" },
        { internal_dir: "/var/lib/postgresql/wal", mode: "ro" },
      ],
      {
        "zap.myproject.abc123.vol1": {
          service: "postgres",
          internal_dir: "/var/lib/postgresql/data",
        },
        "zap.myproject.abc123.vol2": {
          service: "postgres",
          internal_dir: "/var/lib/postgresql/wal",
        },
      },
    );

    expect(volumes).toEqual([
      {
        name: "zap.myproject.abc123.vol1",
        internalDir: "/var/lib/postgresql/data",
        managed: true,
      },
      {
        name: "postgres-logs",
        internalDir: "/var/log/postgresql",
        mode: "ro",
        managed: false,
      },
      {
        name: "postgres-config",
        internalDir: "/etc/postgresql",
        managed: false,
      },
      {
        name: "zap.myproject.abc123.vol2",
        internalDir: "/var/lib/postgresql/wal",
        mode: "ro",
        managed: true,
      },
    ]);
  });

  it("resolves top-level volume names and rich mount objects", () => {
    const projectRoot = makeTempDir();

    const resolved = resolveContainerVolumes({
      projectRoot,
      projectName: "myproject",
      instanceKey: "default",
      instanceId: "abc123",
      serviceName: "api",
      topLevelVolumes: {
        cache: { name: "shared-cache" },
        external_data: { external: true },
      },
      volumes: [
        "cache:/cache:ro",
        {
          type: "volume",
          source: "external_data",
          target: "/data",
          read_only: true,
        },
        {
          type: "bind",
          source: "./fixtures",
          target: "/fixtures",
          read_only: true,
        },
        {
          target: "/generated",
          read_only: true,
        },
      ],
    });

    expect(resolved).toEqual({
      bindings: [
        "shared-cache:/cache:ro",
        "external_data:/data:ro",
        "./fixtures:/fixtures:ro",
        "zap.myproject.abc123.vol1:/generated:ro",
      ],
      namedVolumesToCreate: ["shared-cache", "zap.myproject.abc123.vol1"],
    });
  });
});
