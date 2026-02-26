import path from "path";
import os from "os";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { ExclusiveLockError } from "../errors";

export interface LockInfo {
  projectRoot: string;
  pid: number;
  timestamp: string;
}

/**
 * Check if a process with the given PID is still running
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the lock file path for a project
 */
function getLockFilePath(projectName: string): string {
  const locksDir = path.join(os.homedir(), ".zap", "locks");
  return path.join(locksDir, `${projectName}.lock.json`);
}

/**
 * Check if there's an active exclusive lock for the given project
 */
export function checkExclusiveLock(projectName: string): LockInfo | null {
  const lockPath = getLockFilePath(projectName);

  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const content = readFileSync(lockPath, "utf8");
    const lockInfo: LockInfo = JSON.parse(content);

    // Check if the PID is still alive
    if (!isProcessAlive(lockInfo.pid)) {
      return null; // Stale lock
    }

    return lockInfo;
  } catch (error) {
    // Corrupt lock file, treat as no lock
    return null;
  }
}

/**
 * Acquire an exclusive lock for the given project
 * Throws if the project is already locked by another process
 */
export function acquireExclusiveLock(
  projectName: string,
  projectRoot: string,
): void {
  const existingLock = checkExclusiveLock(projectName);

  if (existingLock) {
    // Check if it's locked by the same directory
    if (existingLock.projectRoot === projectRoot) {
      // Same directory, update the lock with current PID
      // (this handles cases where the same directory runs multiple zap commands)
    } else {
      // Different directory, throw error
      throw new ExclusiveLockError(projectName, existingLock);
    }
  }

  // Create or update the lock
  const lockInfo: LockInfo = {
    projectRoot,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  };

  const lockPath = getLockFilePath(projectName);
  const locksDir = path.dirname(lockPath);

  // Ensure locks directory exists
  if (!existsSync(locksDir)) {
    mkdirSync(locksDir, { recursive: true });
  }

  writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), "utf8");
}

/**
 * Release the exclusive lock for the given project
 * Only releases if the lock is owned by the current process
 */
export function releaseExclusiveLock(projectName: string): void {
  const lockPath = getLockFilePath(projectName);

  if (!existsSync(lockPath)) {
    return; // No lock to release
  }

  try {
    const content = readFileSync(lockPath, "utf8");
    const lockInfo: LockInfo = JSON.parse(content);

    // Only release if we own the lock
    if (lockInfo.pid === process.pid) {
      unlinkSync(lockPath);
    }
  } catch (error) {
    // Error reading lock file, ignore
  }
}
