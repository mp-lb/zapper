import * as fs from "fs";
import * as path from "path";
import { ZapperStateSchema, ZapperState } from "./schemas";
import { renderer } from "../ui/renderer";

interface LoadStateOptions {
  allowDefaultOnError?: boolean;
}

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_POLL_MS = 25;

function defaultState(): ZapperState {
  return {
    lastUpdated: new Date().toISOString(),
  };
}

function statePaths(projectRoot: string): {
  zapDir: string;
  statePath: string;
  lockPath: string;
} {
  const zapDir = path.join(projectRoot, ".zap");
  const statePath = path.join(zapDir, "state.json");
  return {
    zapDir,
    statePath,
    lockPath: `${statePath}.lock`,
  };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireStateLock(lockPath: string): void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(
        path.join(lockPath, "owner.json"),
        JSON.stringify(
          { pid: process.pid, timestamp: new Date().toISOString() },
          null,
          2,
        ),
      );

      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        const stat = fs.statSync(lockPath);

        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for state lock: ${lockPath}`);
      }

      sleepSync(LOCK_POLL_MS);
    }
  }
}

function releaseStateLock(lockPath: string): void {
  fs.rmSync(lockPath, { recursive: true, force: true });
}

function writeStateAtomic(statePath: string, state: ZapperState): void {
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;

  const content = JSON.stringify(state, null, 2);

  try {
    const fd = fs.openSync(tempPath, "w");

    try {
      fs.writeFileSync(fd, content, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tempPath, statePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}

export function loadState(
  projectRoot: string,
  options: LoadStateOptions = {},
): ZapperState {
  const statePath = path.join(projectRoot, ".zap", "state.json");
  const allowDefaultOnError = options.allowDefaultOnError ?? true;

  // Return default state if file doesn't exist
  if (!fs.existsSync(statePath)) {
    return defaultState();
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

    if (!allowDefaultOnError) {
      throw error;
    }

    // Return default state on read/parse errors for read-only callers.
    return defaultState();
  }
}

export function updateState(
  projectRoot: string,
  updater: (currentState: ZapperState) => Partial<ZapperState>,
): ZapperState {
  const { zapDir, statePath, lockPath } = statePaths(projectRoot);

  // Ensure .zap directory exists
  if (!fs.existsSync(zapDir)) {
    fs.mkdirSync(zapDir, { recursive: true });
  }

  acquireStateLock(lockPath);

  try {
    const existingState = loadState(projectRoot, {
      allowDefaultOnError: false,
    });

    const state = updater(existingState);

    const newState: ZapperState = {
      ...existingState,
      ...state,
      lastUpdated: new Date().toISOString(),
    };

    // Validate the new state before saving
    const validatedState = ZapperStateSchema.parse(newState);

    try {
      writeStateAtomic(statePath, validatedState);
      renderer.log.debug(`State saved to ${statePath}`, {
        data: validatedState,
      });

      return validatedState;
    } catch (error) {
      renderer.log.warn(`Failed to save state to ${statePath}: ${error}`);
      throw error;
    }
  } finally {
    releaseStateLock(lockPath);
  }
}

export function saveState(
  projectRoot: string,
  state: Partial<ZapperState>,
): void {
  // Shallow compatibility wrapper. Use updateState() for nested state updates
  // so callers transform the freshest state while holding the state lock.
  updateState(projectRoot, () => state);
}

export function updateServiceState(
  _projectRoot: string,
  _serviceName: string,
  _serviceState: Record<string, unknown>,
): void {
  void _projectRoot;
  void _serviceName;
  void _serviceState;
  // Service lifecycle should not be persisted in state.json.
}

export function clearServiceState(
  _projectRoot: string,
  _serviceName: string,
): void {
  void _projectRoot;
  void _serviceName;
  // Service lifecycle should not be persisted in state.json.
}
