import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { Context } from "../types/Context";

const RegistryInstanceSchema = z
  .object({
    id: z.string(),
    label: z.string().max(100).optional(),
    lastSeenAt: z.string(),
  })
  .strict();

const RegistryProjectSchema = z
  .object({
    registryId: z.string(),
    project: z.string(),
    projectRoot: z.string(),
    configPath: z.string(),
    statePath: z.string(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    lastCommand: z.string().optional(),
    zapperVersion: z.string().optional(),
    instances: z.record(z.string(), RegistryInstanceSchema),
  })
  .strict();

const RegistrySchema = z
  .object({
    version: z.literal(1),
    updatedAt: z.string(),
    projects: z.record(z.string(), RegistryProjectSchema),
  })
  .strict();

export type SystemRegistryInstance = z.infer<typeof RegistryInstanceSchema>;
export type SystemRegistryProject = z.infer<typeof RegistryProjectSchema>;
export type SystemRegistryData = z.infer<typeof RegistrySchema>;

export interface TouchSystemProjectInput {
  context: Context;
  configPath: string;
  command?: string;
  zapperVersion?: string;
}

export interface TouchSystemProjectResult {
  projectNameChanged: {
    from: string;
    to: string;
  } | null;
}

const REGISTRY_VERSION = 1 as const;

const NO_TOUCH_RESULT: TouchSystemProjectResult = {
  projectNameChanged: null,
};

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);

  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

export function getSystemStateDir(): string {
  if (process.env.ZAPPER_SYSTEM_STATE_HOME) {
    return path.resolve(process.env.ZAPPER_SYSTEM_STATE_HOME);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Zapper");
  }

  if (process.platform === "linux") {
    return path.join(
      process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
      "zapper",
    );
  }

  return path.join(os.homedir(), ".zapper");
}

export function getSystemRegistryPath(): string {
  return path.join(getSystemStateDir(), "registry.json");
}

export function getSystemRegistryId(
  projectRoot: string,
  configPath: string,
): string {
  const input = `${canonicalPath(projectRoot)}\0${canonicalPath(configPath)}`;
  return `sha256:${crypto.createHash("sha256").update(input).digest("hex")}`;
}

export function getProjectRootHash(projectRoot: string): string {
  return crypto
    .createHash("sha256")
    .update(canonicalPath(projectRoot))
    .digest("hex");
}

function emptyRegistry(): SystemRegistryData {
  return {
    version: REGISTRY_VERSION,
    updatedAt: new Date(0).toISOString(),
    projects: {},
  };
}

function ensureRegistryDir(): void {
  fs.mkdirSync(getSystemStateDir(), { recursive: true, mode: 0o700 });
}

function withLock<T>(fn: () => T): T {
  ensureRegistryDir();
  const lockPath = path.join(getSystemStateDir(), "registry.lock");
  let fd: number | undefined;

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        continue;
      }

      throw error;
    }
  }

  if (fd === undefined) {
    throw new Error(`Could not acquire system registry lock: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);

    try {
      fs.rmSync(lockPath, { force: true });
    } catch {
      // Ignore lock cleanup races.
    }
  }
}

export function loadSystemRegistry(): SystemRegistryData {
  const registryPath = getSystemRegistryPath();
  if (!fs.existsSync(registryPath)) return emptyRegistry();

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    return RegistrySchema.parse(parsed);
  } catch (error) {
    const brokenPath = `${registryPath}.broken-${Date.now()}`;
    fs.renameSync(registryPath, brokenPath);
    throw new Error(
      `System registry was invalid and has been moved to ${brokenPath}: ${error}`,
    );
  }
}

export function saveSystemRegistry(registry: SystemRegistryData): void {
  const validated = RegistrySchema.parse({
    ...registry,
    updatedAt: new Date().toISOString(),
  });

  ensureRegistryDir();
  const registryPath = getSystemRegistryPath();
  const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(validated, null, 2), {
    mode: 0o600,
  });

  fs.renameSync(tempPath, registryPath);

  try {
    fs.chmodSync(registryPath, 0o600);
  } catch {
    // Best available permissions are acceptable on non-POSIX filesystems.
  }
}

export function touchSystemProject(
  input: TouchSystemProjectInput,
): TouchSystemProjectResult {
  if (process.env.ZAPPER_DISABLE_SYSTEM_REGISTRY === "1") {
    return NO_TOUCH_RESULT;
  }

  if (
    process.env.NODE_ENV === "test" &&
    !process.env.ZAPPER_SYSTEM_STATE_HOME
  ) {
    return NO_TOUCH_RESULT;
  }

  return withLock(() => {
    const registry = loadSystemRegistry();
    const projectRoot = canonicalPath(input.context.projectRoot);
    const configPath = canonicalPath(input.configPath);
    const registryId = getSystemRegistryId(projectRoot, configPath);
    const now = new Date().toISOString();
    const existing = registry.projects[registryId];

    const projectNameChanged =
      existing && existing.project !== input.context.projectName
        ? {
            from: existing.project,
            to: input.context.projectName,
          }
        : null;

    const stateInstances = input.context.state.instances || {};

    const instances: Record<string, SystemRegistryInstance> = {
      ...(existing?.instances || {}),
    };

    for (const [key, instance] of Object.entries(stateInstances)) {
      instances[key] = {
        id: instance.id,
        label: instance.label,
        lastSeenAt: instances[key]?.lastSeenAt || now,
      };
    }

    if (input.context.instanceId) {
      instances[input.context.instanceKey] = {
        id: input.context.instanceId,
        label:
          input.context.instance?.label ??
          stateInstances[input.context.instanceKey]?.label,
        lastSeenAt: now,
      };
    }

    registry.projects[registryId] = {
      registryId,
      project: input.context.projectName,
      projectRoot,
      configPath,
      statePath: path.join(projectRoot, ".zap", "state.json"),
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
      lastCommand: input.command,
      zapperVersion: input.zapperVersion ?? existing?.zapperVersion,
      instances,
    };

    saveSystemRegistry(registry);
    return { projectNameChanged };
  });
}

export function pruneSystemRegistry(): SystemRegistryProject[] {
  return withLock(() => {
    const registry = loadSystemRegistry();
    const removed: SystemRegistryProject[] = [];

    for (const [id, project] of Object.entries(registry.projects)) {
      if (
        !fs.existsSync(project.projectRoot) ||
        !fs.existsSync(project.configPath)
      ) {
        removed.push(project);
        delete registry.projects[id];
      }
    }

    saveSystemRegistry(registry);
    return removed;
  });
}

export function getStaleSystemRegistryProjects(): SystemRegistryProject[] {
  const registry = loadSystemRegistry();
  return Object.values(registry.projects)
    .filter(
      (project) =>
        !fs.existsSync(project.projectRoot) ||
        !fs.existsSync(project.configPath),
    )
    .sort((a, b) => a.project.localeCompare(b.project));
}

export function forgetSystemRegistryEntry(
  registryIdOrPath: string,
): SystemRegistryProject | null {
  return withLock(() => {
    const registry = loadSystemRegistry();
    const targetPath = canonicalPath(registryIdOrPath);
    let removed: SystemRegistryProject | null = null;

    for (const [id, project] of Object.entries(registry.projects)) {
      if (
        id === registryIdOrPath ||
        project.registryId === registryIdOrPath ||
        path.resolve(project.projectRoot) === targetPath ||
        path.resolve(project.configPath) === targetPath
      ) {
        removed = project;
        delete registry.projects[id];
        break;
      }
    }

    saveSystemRegistry(registry);
    return removed;
  });
}
