import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "../types/Context";
import {
  forgetSystemRegistryEntry,
  getSystemRegistryId,
  getSystemRegistryPath,
  loadSystemRegistry,
  pruneSystemRegistry,
  touchSystemProject,
} from "./SystemRegistry";

function makeContext(projectRoot: string): Context {
  return {
    projectName: "myapp",
    projectRoot,
    configPath: path.join(projectRoot, "zap.yaml"),
    environments: [],
    instanceKey: "default",
    instanceId: "abc123",
    instance: {
      key: "default",
      id: "abc123",
      label: "local checkout",
      ports: {},
      volumes: {},
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
          label: "local checkout",
          ports: {},
          volumes: {},
        },
      },
    },
  };
}

describe("SystemRegistry", () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zapper-system-"));
    projectRoot = path.join(tempDir, "project");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "zap.yaml"), "project: myapp\n");
    vi.stubEnv("ZAPPER_SYSTEM_STATE_HOME", path.join(tempDir, "system"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and updates a registered project", () => {
    const context = makeContext(projectRoot);

    const result = touchSystemProject({
      context,
      configPath: context.configPath!,
      command: "status",
      zapperVersion: "1.2.3",
    });

    expect(result.projectNameChanged).toBeNull();
    const registry = loadSystemRegistry();
    const registryId = getSystemRegistryId(projectRoot, context.configPath!);
    expect(fs.existsSync(getSystemRegistryPath())).toBe(true);
    expect(registry.projects[registryId]).toMatchObject({
      registryId,
      project: "myapp",
      lastCommand: "status",
      zapperVersion: "1.2.3",
      instances: {
        default: { id: "abc123", label: "local checkout" },
      },
    });
  });

  it("reports project name changes once for the same project root and config", () => {
    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });

    const renamedContext = {
      ...context,
      projectName: "renamed-app",
    };

    const firstRename = touchSystemProject({
      context: renamedContext,
      configPath: renamedContext.configPath!,
    });

    const secondRename = touchSystemProject({
      context: renamedContext,
      configPath: renamedContext.configPath!,
    });

    const registryId = getSystemRegistryId(projectRoot, context.configPath!);
    expect(firstRename.projectNameChanged).toEqual({
      from: "myapp",
      to: "renamed-app",
    });

    expect(secondRename.projectNameChanged).toBeNull();
    expect(loadSystemRegistry().projects[registryId].project).toBe(
      "renamed-app",
    );
  });

  it("forgets by registry id or project path", () => {
    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });

    const registryId = getSystemRegistryId(projectRoot, context.configPath!);
    expect(forgetSystemRegistryEntry(registryId)?.project).toBe("myapp");
    expect(Object.keys(loadSystemRegistry().projects)).toHaveLength(0);

    touchSystemProject({ context, configPath: context.configPath! });
    expect(forgetSystemRegistryEntry(projectRoot)?.project).toBe("myapp");
    expect(Object.keys(loadSystemRegistry().projects)).toHaveLength(0);
  });

  it("prunes entries whose project root or config path is missing", () => {
    const context = makeContext(projectRoot);
    touchSystemProject({ context, configPath: context.configPath! });
    fs.rmSync(projectRoot, { recursive: true, force: true });

    const removed = pruneSystemRegistry();
    expect(removed).toHaveLength(1);
    expect(removed[0].project).toBe("myapp");
    expect(Object.keys(loadSystemRegistry().projects)).toHaveLength(0);
  });
});
