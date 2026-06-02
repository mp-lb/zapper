import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../types/Context";
import { loadSystemRegistry, touchSystemProject } from "../system";
import type { Zapper } from "../core/Zapper";
import { SystemCommand } from "./SystemCommand";

function makeContext(projectRoot: string): Context {
  return {
    projectName: "missing-worktree",
    projectRoot,
    configPath: path.join(projectRoot, "zap.yaml"),
    environments: [],
    instanceKey: "default",
    instanceId: "abc123",
    instance: {
      key: "default",
      id: "abc123",
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
          id: "abc123",
          ports: {},
        },
      },
    },
  };
}

describe("SystemCommand", () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zapper-system-command-"));
    projectRoot = path.join(tempDir, "project");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "zap.yaml"),
      "project: missing-worktree\n",
    );

    vi.stubEnv("ZAPPER_SYSTEM_STATE_HOME", path.join(tempDir, "system"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("labels missing projects as stale even when --prune is set", async () => {
    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });
    fs.rmSync(projectRoot, { recursive: true, force: true });

    const result = await new SystemCommand().execute({
      zapper: {} as Zapper,
      service: ["projects"],
      options: { prune: true },
    });

    expect(result?.kind).toBe("system.projects");
    if (result?.kind !== "system.projects") return;
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].state).toBe("stale");
    expect(Object.keys(loadSystemRegistry().projects)).toHaveLength(1);
  });

  it("lists missing projects as stale when --prune is not set", async () => {
    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });
    fs.rmSync(projectRoot, { recursive: true, force: true });

    const result = await new SystemCommand().execute({
      zapper: {} as Zapper,
      service: ["projects"],
      options: {},
    });

    expect(result?.kind).toBe("system.projects");
    if (result?.kind !== "system.projects") return;
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].state).toBe("stale");
    expect(Object.keys(loadSystemRegistry().projects)).toHaveLength(1);
  });
});
