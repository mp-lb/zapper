import * as fs from "fs";
import * as path from "path";
import { renderer } from "../ui/renderer";

const PORTS_FILE_NAME = "ports.json";
const ZAP_DIR_NAME = ".zap";

/**
 * Load assigned port values from .zap/ports.json
 */
export function loadPorts(projectRoot: string): Record<string, string> {
  const portsPath = path.join(projectRoot, ZAP_DIR_NAME, PORTS_FILE_NAME);

  if (!fs.existsSync(portsPath)) {
    renderer.log.debug(`No ports file found at ${portsPath}`);
    return {};
  }

  try {
    const content = fs.readFileSync(portsPath, "utf-8");
    const ports = JSON.parse(content) as Record<string, string>;
    renderer.log.debug(`Loaded ports from ${portsPath}`, { data: ports });
    return ports;
  } catch (error) {
    renderer.log.warn(`Failed to load ports from ${portsPath}: ${error}`);
    return {};
  }
}

/**
 * Save assigned port values to .zap/ports.json
 */
export function savePorts(
  projectRoot: string,
  ports: Record<string, string>,
): void {
  const zapDir = path.join(projectRoot, ZAP_DIR_NAME);
  const portsPath = path.join(zapDir, PORTS_FILE_NAME);

  // Ensure .zap directory exists
  if (!fs.existsSync(zapDir)) {
    fs.mkdirSync(zapDir, { recursive: true });
  }

  try {
    fs.writeFileSync(portsPath, JSON.stringify(ports, null, 2));
    renderer.log.debug(`Saved ports to ${portsPath}`, { data: ports });
  } catch (error) {
    renderer.log.warn(`Failed to save ports to ${portsPath}: ${error}`);
    throw error;
  }
}

/**
 * Delete the ports.json file
 */
export function clearPorts(projectRoot: string): void {
  const portsPath = path.join(projectRoot, ZAP_DIR_NAME, PORTS_FILE_NAME);

  if (fs.existsSync(portsPath)) {
    try {
      fs.unlinkSync(portsPath);
      renderer.log.debug(`Deleted ports file at ${portsPath}`);
    } catch (error) {
      renderer.log.warn(
        `Failed to delete ports file at ${portsPath}: ${error}`,
      );
    }
  }
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
 * Get the path to the ports.json file
 */
export function getPortsPath(projectRoot: string): string {
  return path.join(projectRoot, ZAP_DIR_NAME, PORTS_FILE_NAME);
}
