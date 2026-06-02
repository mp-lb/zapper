import { Container, StoredVolume, TopLevelVolume, Volume } from "./schemas";
import { loadState, updateState } from "./stateLoader";
import { DEFAULT_INSTANCE_KEY, ensureInstance } from "../core/instanceResolver";

export interface ManagedVolumeSpec {
  serviceName: string;
  internalDir: string;
}

export interface ResolvedVolumes {
  bindings: string[];
  namedVolumesToCreate: string[];
}

export interface ServiceDockerVolume {
  name: string;
  internalDir: string;
  mode?: string;
  managed: boolean;
}

type ContainerVolume = NonNullable<Container["volumes"]>[number];
type MountVolume = Extract<ContainerVolume, { target: string }>;

function getVolumeKey(spec: ManagedVolumeSpec): string {
  return `${spec.serviceName}:${spec.internalDir}`;
}

function slugify(value: string): string {
  const slug = value
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "volume";
}

export function generateManagedVolumeName(
  projectName: string,
  instanceId: string,
  index: number,
): string {
  return ["zap", slugify(projectName), slugify(instanceId), `vol${index}`].join(
    ".",
  );
}

function getNextVolumeIndex(existingNames: Iterable<string>): number {
  let maxIndex = 0;

  for (const name of existingNames) {
    const match = name.match(/\.vol(\d+)$/);
    if (!match) continue;
    const parsed = parseInt(match[1], 10);

    if (!Number.isNaN(parsed)) {
      maxIndex = Math.max(maxIndex, parsed);
    }
  }

  return maxIndex + 1;
}

export function loadVolumesForInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): Record<string, StoredVolume> {
  return loadState(projectRoot).instances?.[instanceKey]?.volumes || {};
}

export function saveVolumesForInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
  volumes: Record<string, StoredVolume>,
): void {
  const state = loadState(projectRoot);
  const instance = state.instances?.[instanceKey];

  const ensured = instance?.id
    ? { id: instance.id, created: false }
    : ensureInstance(projectRoot, instanceKey);

  const refreshed = ensured.created ? loadState(projectRoot) : state;
  const refreshedInstance = refreshed.instances?.[instanceKey];
  const refreshedId = refreshedInstance?.id || ensured.id;

  updateState(projectRoot, (latest) => {
    const latestInstance = latest.instances?.[instanceKey];
    return {
      instances: {
        ...(latest.instances || {}),
        [instanceKey]: {
          ...(latestInstance || refreshedInstance || {}),
          id: latestInstance?.id || refreshedId,
          volumes,
        },
      },
    };
  });
}

export function initializeManagedVolumes(
  projectRoot: string,
  projectName: string,
  instanceKey: string,
  instanceId: string,
  specs: ManagedVolumeSpec[],
  options: { prune?: boolean } = {},
): Record<string, string> {
  const uniqueSpecs = new Map<string, ManagedVolumeSpec>();

  for (const spec of specs) {
    uniqueSpecs.set(getVolumeKey(spec), spec);
  }

  const existing = loadVolumesForInstance(projectRoot, instanceKey);
  const next: Record<string, string> = {};

  const nextState: Record<string, StoredVolume> =
    options.prune === false ? { ...existing } : {};

  const existingBySpec = new Map<string, string>();

  for (const [volumeName, volume] of Object.entries(existing)) {
    existingBySpec.set(
      getVolumeKey({
        serviceName: volume.service,
        internalDir: volume.internal_dir,
      }),
      volumeName,
    );
  }

  const usedNames = new Set(Object.keys(existing));
  let nextIndex = getNextVolumeIndex(usedNames);

  for (const key of uniqueSpecs.keys()) {
    const spec = uniqueSpecs.get(key)!;
    const existingVolumeName = existingBySpec.get(key);

    if (existingVolumeName) {
      next[key] = existingVolumeName;
      nextState[existingVolumeName] = {
        service: spec.serviceName,
        internal_dir: spec.internalDir,
      };

      continue;
    }

    let generated = generateManagedVolumeName(
      projectName,
      instanceId,
      nextIndex,
    );
    nextIndex += 1;

    while (usedNames.has(generated)) {
      generated = generateManagedVolumeName(projectName, instanceId, nextIndex);
      nextIndex += 1;
    }

    usedNames.add(generated);
    next[key] = generated;
    nextState[generated] = {
      service: spec.serviceName,
      internal_dir: spec.internalDir,
    };
  }

  saveVolumesForInstance(projectRoot, instanceKey, nextState);
  return next;
}

export function resetManagedVolumesForInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): Record<string, StoredVolume> {
  const existing = loadVolumesForInstance(projectRoot, instanceKey);
  saveVolumesForInstance(projectRoot, instanceKey, {});
  return existing;
}

export function findStaleManagedVolumes(
  projectRoot: string,
  instanceKey: string,
  currentSpecs: ManagedVolumeSpec[],
): Record<string, StoredVolume> {
  const currentKeys = new Set(currentSpecs.map((spec) => getVolumeKey(spec)));
  const stale: Record<string, StoredVolume> = {};

  for (const [volumeName, volume] of Object.entries(
    loadVolumesForInstance(projectRoot, instanceKey),
  )) {
    const key = getVolumeKey({
      serviceName: volume.service,
      internalDir: volume.internal_dir,
    });

    if (!currentKeys.has(key)) {
      stale[volumeName] = volume;
    }
  }

  return stale;
}

export function pruneStaleManagedVolumesForInstance(
  projectRoot: string,
  instanceKey: string,
  currentSpecs: ManagedVolumeSpec[],
): Record<string, StoredVolume> {
  const stale = findStaleManagedVolumes(projectRoot, instanceKey, currentSpecs);
  if (Object.keys(stale).length === 0) return stale;

  const staleNames = new Set(Object.keys(stale));
  const remaining: Record<string, StoredVolume> = {};

  for (const [volumeName, volume] of Object.entries(
    loadVolumesForInstance(projectRoot, instanceKey),
  )) {
    if (!staleNames.has(volumeName)) {
      remaining[volumeName] = volume;
    }
  }

  saveVolumesForInstance(projectRoot, instanceKey, remaining);
  return stale;
}

function isPathOnlyVolume(volume: ContainerVolume): boolean {
  if (typeof volume !== "string" && "target" in volume) {
    return (
      !volume.source && (volume.type === undefined || volume.type === "volume")
    );
  }

  if (typeof volume !== "string") return !volume.name;
  const parsed = parseVolumeString(volume);
  return !parsed.source && parsed.internalDir.startsWith("/");
}

function parseVolumeString(volume: string): {
  source?: string;
  internalDir: string;
  suffix?: string;
} {
  const [source, internalDir, suffix] = volume.split(":");
  if (!internalDir) return { internalDir: source };

  if (source.startsWith("/") && !internalDir.startsWith("/")) {
    return { internalDir: source, suffix: internalDir };
  }

  return { source, internalDir, suffix };
}

function appendMode(binding: string, mode?: string): string {
  return mode ? `${binding}:${mode}` : binding;
}

function isBindMountSource(source: string): boolean {
  return (
    source.startsWith("/") ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    source === "." ||
    source === ".." ||
    source.startsWith("~/")
  );
}

function isMountVolume(volume: ContainerVolume): volume is MountVolume {
  return typeof volume !== "string" && "target" in volume;
}

function mountMode(volume: MountVolume): string | undefined {
  if (volume.read_only) return volume.mode ? `${volume.mode},ro` : "ro";
  return volume.mode;
}

function renderMountVolume(volume: MountVolume): string {
  if (!volume.source) {
    return appendMode(volume.target, mountMode(volume));
  }

  return appendMode(`${volume.source}:${volume.target}`, mountMode(volume));
}

function mountSourceNeedsVolumeCreate(volume: MountVolume): string | null {
  if (!volume.source || volume.type === "bind") {
    return null;
  }

  if (isBindMountSource(volume.source)) return null;
  return volume.source;
}

function resolveTopLevelVolumeName(
  source: string,
  topLevelVolumes?: Record<string, TopLevelVolume>,
): string {
  return topLevelVolumes?.[source]?.name || source;
}

function shouldCreateNamedVolume(
  logicalName: string,
  topLevelVolumes?: Record<string, TopLevelVolume>,
): boolean {
  return !topLevelVolumes?.[logicalName]?.external;
}

export function collectManagedVolumeSpecs(
  containers: Array<{ name: string; volumes?: Container["volumes"] }>,
): ManagedVolumeSpec[] {
  const specs: ManagedVolumeSpec[] = [];

  for (const container of containers) {
    for (const volume of container.volumes || []) {
      if (!isPathOnlyVolume(volume)) continue;

      const internalDir =
        typeof volume === "string"
          ? parseVolumeString(volume).internalDir
          : isMountVolume(volume)
            ? volume.target
            : volume.internal_dir;

      specs.push({ serviceName: container.name, internalDir });
    }
  }

  return specs;
}

export function resolveContainerVolumes({
  projectRoot,
  projectName,
  instanceKey = DEFAULT_INSTANCE_KEY,
  instanceId,
  serviceName,
  volumes,
  topLevelVolumes,
}: {
  projectRoot: string;
  projectName: string;
  instanceKey?: string;
  instanceId: string;
  serviceName: string;
  volumes?: Container["volumes"];
  topLevelVolumes?: Record<string, TopLevelVolume>;
}): ResolvedVolumes {
  const bindings: string[] = [];
  const namedVolumesToCreate: string[] = [];
  const managedSpecs: ManagedVolumeSpec[] = [];

  for (const volume of volumes || []) {
    if (typeof volume === "string") {
      const parsed = parseVolumeString(volume);

      if (!parsed.source) {
        managedSpecs.push({ serviceName, internalDir: parsed.internalDir });
        continue;
      }

      if (!isBindMountSource(parsed.source)) {
        const resolvedName = resolveTopLevelVolumeName(
          parsed.source,
          topLevelVolumes,
        );

        bindings.push(
          appendMode(`${resolvedName}:${parsed.internalDir}`, parsed.suffix),
        );

        if (shouldCreateNamedVolume(parsed.source, topLevelVolumes)) {
          namedVolumesToCreate.push(resolvedName);
        }
      } else {
        bindings.push(volume);
      }

      continue;
    }

    if (isMountVolume(volume)) {
      if (!volume.source && volume.type !== "bind") {
        managedSpecs.push({ serviceName, internalDir: volume.target });
        continue;
      }

      const sourceVolume = mountSourceNeedsVolumeCreate(volume);

      if (sourceVolume) {
        const resolvedName = resolveTopLevelVolumeName(
          sourceVolume,
          topLevelVolumes,
        );

        bindings.push(
          appendMode(`${resolvedName}:${volume.target}`, mountMode(volume)),
        );

        if (shouldCreateNamedVolume(sourceVolume, topLevelVolumes)) {
          namedVolumesToCreate.push(resolvedName);
        }
      } else {
        bindings.push(renderMountVolume(volume));
      }

      continue;
    }

    const namedVolume = volume as Volume;

    if (namedVolume.name) {
      const resolvedName = resolveTopLevelVolumeName(
        namedVolume.name,
        topLevelVolumes,
      );

      if (shouldCreateNamedVolume(namedVolume.name, topLevelVolumes)) {
        namedVolumesToCreate.push(resolvedName);
      }

      bindings.push(
        appendMode(
          `${resolvedName}:${namedVolume.internal_dir}`,
          namedVolume.mode,
        ),
      );

      continue;
    }

    managedSpecs.push({
      serviceName,
      internalDir: namedVolume.internal_dir,
    });
  }

  if (managedSpecs.length > 0) {
    const managedVolumes = initializeManagedVolumes(
      projectRoot,
      projectName,
      instanceKey,
      instanceId,
      managedSpecs,
      { prune: false },
    );

    for (const spec of managedSpecs) {
      const volumeName = managedVolumes[getVolumeKey(spec)];
      namedVolumesToCreate.push(volumeName);

      const sourceVolume = (volumes || []).find((volume) => {
        if (typeof volume === "string") {
          const parsed = parseVolumeString(volume);
          return !parsed.source && parsed.internalDir === spec.internalDir;
        }

        if (isMountVolume(volume)) {
          return !volume.source && volume.target === spec.internalDir;
        }

        return !volume.name && volume.internal_dir === spec.internalDir;
      });

      const mode =
        typeof sourceVolume === "string"
          ? parseVolumeString(sourceVolume).suffix
          : sourceVolume && isMountVolume(sourceVolume)
            ? mountMode(sourceVolume)
            : sourceVolume?.mode;

      bindings.push(appendMode(`${volumeName}:${spec.internalDir}`, mode));
    }
  }

  return {
    bindings,
    namedVolumesToCreate: Array.from(new Set(namedVolumesToCreate)),
  };
}

export function getContainerVolumeBindings(
  serviceName: string,
  volumes: Container["volumes"] | undefined,
  managedVolumes: Record<string, StoredVolume>,
): string[] {
  const bindings: string[] = [];

  for (const volume of volumes || []) {
    if (typeof volume === "string") {
      const parsed = parseVolumeString(volume);

      if (parsed.source) {
        bindings.push(volume);
        continue;
      }

      const volumeName = Object.entries(managedVolumes).find(
        ([, stored]) =>
          stored.service === serviceName &&
          stored.internal_dir === parsed.internalDir,
      )?.[0];

      bindings.push(
        volumeName
          ? appendMode(`${volumeName}:${parsed.internalDir}`, parsed.suffix)
          : appendMode(parsed.internalDir, parsed.suffix),
      );

      continue;
    }

    if (isMountVolume(volume)) {
      if (volume.source) {
        bindings.push(renderMountVolume(volume));
        continue;
      }

      const volumeName = Object.entries(managedVolumes).find(
        ([, stored]) =>
          stored.service === serviceName &&
          stored.internal_dir === volume.target,
      )?.[0];

      bindings.push(
        volumeName
          ? appendMode(`${volumeName}:${volume.target}`, mountMode(volume))
          : appendMode(volume.target, mountMode(volume)),
      );

      continue;
    }

    if (volume.name) {
      bindings.push(
        appendMode(`${volume.name}:${volume.internal_dir}`, volume.mode),
      );

      continue;
    }

    const volumeName = Object.entries(managedVolumes).find(
      ([, stored]) =>
        stored.service === serviceName &&
        stored.internal_dir === volume.internal_dir,
    )?.[0];

    bindings.push(
      volumeName
        ? appendMode(`${volumeName}:${volume.internal_dir}`, volume.mode)
        : appendMode(volume.internal_dir, volume.mode),
    );
  }

  return bindings;
}

export function getServiceDockerVolumes(
  serviceName: string,
  volumes: Container["volumes"] | undefined,
  managedVolumes: Record<string, StoredVolume>,
): ServiceDockerVolume[] {
  const dockerVolumes: ServiceDockerVolume[] = [];

  for (const volume of volumes || []) {
    if (typeof volume === "string") {
      const parsed = parseVolumeString(volume);

      if (!parsed.source) {
        const volumeName = Object.entries(managedVolumes).find(
          ([, stored]) =>
            stored.service === serviceName &&
            stored.internal_dir === parsed.internalDir,
        )?.[0];

        if (volumeName) {
          dockerVolumes.push({
            name: volumeName,
            internalDir: parsed.internalDir,
            mode: parsed.suffix,
            managed: true,
          });
        }

        continue;
      }

      if (!isBindMountSource(parsed.source)) {
        dockerVolumes.push({
          name: parsed.source,
          internalDir: parsed.internalDir,
          mode: parsed.suffix,
          managed: false,
        });
      }

      continue;
    }

    if (isMountVolume(volume)) {
      if (!volume.source) {
        const volumeName = Object.entries(managedVolumes).find(
          ([, stored]) =>
            stored.service === serviceName &&
            stored.internal_dir === volume.target,
        )?.[0];

        if (volumeName) {
          dockerVolumes.push({
            name: volumeName,
            internalDir: volume.target,
            mode: mountMode(volume),
            managed: true,
          });
        }

        continue;
      }

      if (volume.type !== "bind" && !isBindMountSource(volume.source)) {
        dockerVolumes.push({
          name: volume.source,
          internalDir: volume.target,
          mode: mountMode(volume),
          managed: false,
        });
      }

      continue;
    }

    if (volume.name) {
      dockerVolumes.push({
        name: volume.name,
        internalDir: volume.internal_dir,
        mode: volume.mode,
        managed: false,
      });

      continue;
    }

    const volumeName = Object.entries(managedVolumes).find(
      ([, stored]) =>
        stored.service === serviceName &&
        stored.internal_dir === volume.internal_dir,
    )?.[0];

    if (volumeName) {
      dockerVolumes.push({
        name: volumeName,
        internalDir: volume.internal_dir,
        mode: volume.mode,
        managed: true,
      });
    }
  }

  return dockerVolumes;
}
