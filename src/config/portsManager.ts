import * as path from "path";
import { loadState, saveState } from "./stateLoader";
import { DEFAULT_INSTANCE_KEY, ensureInstance } from "../core/instanceResolver";

const STATE_FILE_NAME = "state.json";
const ZAP_DIR_NAME = ".zap";

/**
 * Load assigned port values from .zap/state.json
 */
export function loadPorts(projectRoot: string): Record<string, string> {
  return loadPortsForInstance(projectRoot, DEFAULT_INSTANCE_KEY);
}

export function loadPortsForInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): Record<string, string> {
  const state = loadState(projectRoot);
  const instancePorts = state.instances?.[instanceKey]?.ports;
  if (instancePorts) return instancePorts;
  if (instanceKey === DEFAULT_INSTANCE_KEY) return state.ports || {};
  return {};
}

/**
 * Save assigned port values to .zap/state.json
 */
export function savePorts(
  projectRoot: string,
  ports: Record<string, string>,
): void {
  savePortsForInstance(projectRoot, DEFAULT_INSTANCE_KEY, ports);
}

export function savePortsForInstance(
  projectRoot: string,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
  ports: Record<string, string>,
): void {
  const state = loadState(projectRoot);
  const instance = state.instances?.[instanceKey];
  const ensured = instance?.id
    ? { id: instance.id, created: false }
    : ensureInstance(projectRoot, instanceKey);
  const refreshed = ensured.created ? loadState(projectRoot) : state;
  const refreshedInstance = refreshed.instances?.[instanceKey];
  const refreshedId = refreshedInstance?.id || ensured.id;

  saveState(projectRoot, {
    instances: {
      ...(refreshed.instances || {}),
      [instanceKey]: {
        ...(refreshedInstance || {}),
        id: refreshedId,
        ports,
      },
    },
    // Legacy compatibility for default instance readers.
    ports: instanceKey === DEFAULT_INSTANCE_KEY ? ports : refreshed.ports,
  });
}

/**
 * Clear assigned ports from .zap/state.json
 */
export function clearPorts(projectRoot: string): void {
  savePortsForInstance(projectRoot, DEFAULT_INSTANCE_KEY, {});
}

/**
 * Generate a random port number in the valid range (1024-65535)
 */
export function generateRandomPort(): number {
  // Use ports in the dynamic/private range (49152-65535) to avoid conflicts
  // with well-known ports and registered ports
  const min = 49152;
  const max = 65535;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random ports for the given port names
 */
export function assignRandomPorts(portNames: string[]): Record<string, string> {
  const ports: Record<string, string> = {};
  const usedPorts = new Set<number>();

  for (const name of portNames) {
    let port = generateRandomPort();
    // Ensure no duplicates in this batch
    while (usedPorts.has(port)) {
      port = generateRandomPort();
    }
    usedPorts.add(port);
    ports[name] = port.toString();
  }

  return ports;
}

/**
 * Incrementally initialize ports while preserving existing assignments.
 */
export function initializePorts(
  projectRoot: string,
  portNames: string[],
  instanceOrOptions: string | { randomizeAll?: boolean } = DEFAULT_INSTANCE_KEY,
  maybeOptions: { randomizeAll?: boolean } = {},
): Record<string, string> {
  const instanceKey =
    typeof instanceOrOptions === "string"
      ? instanceOrOptions
      : DEFAULT_INSTANCE_KEY;
  const options =
    typeof instanceOrOptions === "string" ? maybeOptions : instanceOrOptions;
  const normalizedPortNames = Array.from(new Set(portNames));
  const existingPorts = loadPortsForInstance(projectRoot, instanceKey);

  if (options.randomizeAll) {
    const randomized = assignRandomPorts(normalizedPortNames);
    savePortsForInstance(projectRoot, instanceKey, randomized);
    return randomized;
  }

  const nextPorts: Record<string, string> = {};
  const usedPorts = new Set<number>();

  for (const name of normalizedPortNames) {
    const existing = existingPorts[name];
    if (existing) {
      const existingPort = parseInt(existing, 10);
      if (!Number.isNaN(existingPort)) {
        nextPorts[name] = existing;
        usedPorts.add(existingPort);
        continue;
      }
    }

    let port = generateRandomPort();
    while (usedPorts.has(port)) {
      port = generateRandomPort();
    }
    usedPorts.add(port);
    nextPorts[name] = port.toString();
  }

  savePortsForInstance(projectRoot, instanceKey, nextPorts);
  return nextPorts;
}

/**
 * Get the path to the state file that stores assigned ports
 */
export function getPortsPath(projectRoot: string): string {
  return path.join(projectRoot, ZAP_DIR_NAME, STATE_FILE_NAME);
}
