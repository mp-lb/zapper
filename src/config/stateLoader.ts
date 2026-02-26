import * as fs from "fs";
import * as path from "path";
import { ZapperStateSchema, ZapperState, ServiceState } from "./schemas";
import { renderer } from "../ui/renderer";

export function loadState(projectRoot: string): ZapperState {
  const statePath = path.join(projectRoot, ".zap", "state.json");

  // Return default state if file doesn't exist
  if (!fs.existsSync(statePath)) {
    return {
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const stateContent = fs.readFileSync(statePath, "utf-8");
    const rawState = JSON.parse(stateContent);

    // Validate with Zod schema
    const validatedState = ZapperStateSchema.parse(rawState);

    renderer.log.debug(`Loaded state from ${statePath}`, {
      data: validatedState,
    });
    return validatedState;
  } catch (error) {
    renderer.log.warn(
      `Failed to load or validate state from ${statePath}: ${error}`,
    );
    // Return default state on error
    return {
      lastUpdated: new Date().toISOString(),
    };
  }
}

export function saveState(
  projectRoot: string,
  state: Partial<ZapperState>,
): void {
  const zapDir = path.join(projectRoot, ".zap");
  const statePath = path.join(zapDir, "state.json");

  // Ensure .zap directory exists
  if (!fs.existsSync(zapDir)) {
    fs.mkdirSync(zapDir, { recursive: true });
  }

  // Load existing state and merge with new state
  const existingState = loadState(projectRoot);
  const newState: ZapperState = {
    ...existingState,
    ...state,
    lastUpdated: new Date().toISOString(),
  };

  // Validate the new state before saving
  const validatedState = ZapperStateSchema.parse(newState);

  try {
    fs.writeFileSync(statePath, JSON.stringify(validatedState, null, 2));
    renderer.log.debug(`State saved to ${statePath}`, { data: validatedState });
  } catch (error) {
    renderer.log.warn(`Failed to save state to ${statePath}: ${error}`);
    throw error;
  }
}

export function updateServiceState(
  projectRoot: string,
  serviceName: string,
  serviceState: Partial<ServiceState>,
): void {
  const existingState = loadState(projectRoot);
  const services = existingState.services || {};
  const existing = services[serviceName] || {};

  saveState(projectRoot, {
    services: {
      ...services,
      [serviceName]: { ...existing, ...serviceState },
    },
  });
}

export function clearServiceState(
  projectRoot: string,
  serviceName: string,
): void {
  const existingState = loadState(projectRoot);
  const services = existingState.services || {};
  delete services[serviceName];

  saveState(projectRoot, { services });
}
