import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { VolumeCommand } from "./VolumeCommand";
import type { Zapper } from "../core/Zapper";

describe("VolumeCommand", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function makeTempDir(): string {
    tempDir = mkdtempSync(path.join(tmpdir(), "zapper-volume-command-"));
    return tempDir;
  }

  it("lists generated and explicit Docker volumes for a service", async () => {
    const projectRoot = makeTempDir();
    const command = new VolumeCommand();

    const zapper = {
      getContext: () => ({
        projectName: "myproject",
        projectRoot,
        instanceKey: "default",
        instanceId: "abc123",
        processes: [],
        containers: [
          {
            name: "postgres",
            image: "postgres:15",
            volumes: [
              "/var/lib/postgresql/data",
              "postgres-logs:/var/log/postgresql:ro",
              "./init.sql:/docker-entrypoint-initdb.d/init.sql",
              { name: "postgres-config", internal_dir: "/etc/postgresql" },
              { internal_dir: "/var/lib/postgresql/wal", mode: "ro" },
            ],
          },
        ],
        tasks: [],
        links: [],
        environments: [],
        profiles: [],
        state: {},
      }),
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: ["list", "postgres"],
      options: {},
    });

    expect(result).toEqual({
      kind: "volume.list",
      instanceKey: "default",
      service: "postgres",
      managedOnly: false,
      idOnly: false,
      volumes: [
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
      ],
    });
  });

  it("filters to managed volumes and marks id-only output", async () => {
    const projectRoot = makeTempDir();
    const command = new VolumeCommand();

    const zapper = {
      getContext: () => ({
        projectName: "myproject",
        projectRoot,
        instanceKey: "default",
        instanceId: "abc123",
        processes: [],
        containers: [
          {
            name: "postgres",
            image: "postgres:15",
            volumes: [
              "/var/lib/postgresql/data",
              "postgres-logs:/var/log/postgresql:ro",
              { internal_dir: "/var/lib/postgresql/wal", mode: "ro" },
            ],
          },
        ],
        tasks: [],
        links: [],
        environments: [],
        profiles: [],
        state: {},
      }),
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: ["list", "postgres"],
      options: { managed: true, idOnly: true },
    });

    expect(result).toEqual({
      kind: "volume.list",
      instanceKey: "default",
      service: "postgres",
      managedOnly: true,
      idOnly: true,
      volumes: [
        {
          name: "zap.myproject.abc123.vol1",
          internalDir: "/var/lib/postgresql/data",
          managed: true,
        },
        {
          name: "zap.myproject.abc123.vol2",
          internalDir: "/var/lib/postgresql/wal",
          mode: "ro",
          managed: true,
        },
      ],
    });
  });
});
