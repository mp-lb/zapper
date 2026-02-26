import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import os from "os";
import {
  checkExclusiveLock,
  acquireExclusiveLock,
  releaseExclusiveLock,
} from "./exclusiveLock";
import { ExclusiveLockError } from "../errors";

describe("exclusiveLock", () => {
  const testHome = path.join(__dirname, "../../test-fixtures/lock-test-home");
  const locksDir = path.join(testHome, ".zap", "locks");
  const projectName = "test-project";
  const projectRoot1 = "/path/to/project1";
  const projectRoot2 = "/path/to/project2";

  beforeEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    mkdirSync(testHome, { recursive: true });

    // Mock os.homedir to return our test directory
    vi.spyOn(os, "homedir").mockReturnValue(testHome);
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe("checkExclusiveLock", () => {
    it("should return null when no lock file exists", () => {
      const result = checkExclusiveLock(projectName);
      expect(result).toBeNull();
    });

    it("should return null for malformed lock file", () => {
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      writeFileSync(lockPath, "invalid json");

      const result = checkExclusiveLock(projectName);
      expect(result).toBeNull();
    });

    it("should return null for stale lock (dead PID)", () => {
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      const staleLock = {
        projectRoot: projectRoot1,
        pid: 99999, // Extremely unlikely to exist
        timestamp: new Date().toISOString(),
      };
      writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

      const result = checkExclusiveLock(projectName);
      expect(result).toBeNull();
    });

    it("should return lock info for active lock", () => {
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      const activeLock = {
        projectRoot: projectRoot1,
        pid: process.pid, // Current process
        timestamp: new Date().toISOString(),
      };
      writeFileSync(lockPath, JSON.stringify(activeLock, null, 2));

      const result = checkExclusiveLock(projectName);
      expect(result).toEqual(activeLock);
    });
  });

  describe("acquireExclusiveLock", () => {
    it("should create lock file when no lock exists", () => {
      acquireExclusiveLock(projectName, projectRoot1);

      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      expect(existsSync(lockPath)).toBe(true);

      const lock = checkExclusiveLock(projectName);
      expect(lock).toEqual({
        projectRoot: projectRoot1,
        pid: process.pid,
        timestamp: expect.any(String),
      });
    });

    it("should update lock when same directory acquires again", () => {
      acquireExclusiveLock(projectName, projectRoot1);

      // Should not throw when same directory acquires again
      expect(() => {
        acquireExclusiveLock(projectName, projectRoot1);
      }).not.toThrow();
    });

    it("should throw ExclusiveLockError when different directory tries to acquire", () => {
      // First acquisition from project root 1
      acquireExclusiveLock(projectName, projectRoot1);

      // Second acquisition from project root 2 should fail
      expect(() => {
        acquireExclusiveLock(projectName, projectRoot2);
      }).toThrow(ExclusiveLockError);
    });

    it("should take over stale lock", () => {
      // Create a stale lock manually
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      const staleLock = {
        projectRoot: projectRoot1,
        pid: 99999, // Dead PID
        timestamp: new Date().toISOString(),
      };
      writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

      // Should be able to acquire the lock
      expect(() => {
        acquireExclusiveLock(projectName, projectRoot2);
      }).not.toThrow();

      const lock = checkExclusiveLock(projectName);
      expect(lock?.projectRoot).toBe(projectRoot2);
      expect(lock?.pid).toBe(process.pid);
    });

    it("should create locks directory if it does not exist", () => {
      expect(existsSync(locksDir)).toBe(false);

      acquireExclusiveLock(projectName, projectRoot1);

      expect(existsSync(locksDir)).toBe(true);
    });
  });

  describe("releaseExclusiveLock", () => {
    it("should do nothing when no lock exists", () => {
      expect(() => {
        releaseExclusiveLock(projectName);
      }).not.toThrow();
    });

    it("should release lock owned by current process", () => {
      acquireExclusiveLock(projectName, projectRoot1);
      expect(checkExclusiveLock(projectName)).not.toBeNull();

      releaseExclusiveLock(projectName);
      expect(checkExclusiveLock(projectName)).toBeNull();
    });

    it("should not release lock owned by different process", () => {
      // Manually create a lock owned by a different PID
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      const otherLock = {
        projectRoot: projectRoot1,
        pid: process.pid + 1, // Different PID
        timestamp: new Date().toISOString(),
      };
      writeFileSync(lockPath, JSON.stringify(otherLock, null, 2));

      releaseExclusiveLock(projectName);

      // Lock should still exist
      expect(existsSync(lockPath)).toBe(true);
    });

    it("should handle malformed lock file gracefully", () => {
      mkdirSync(locksDir, { recursive: true });
      const lockPath = path.join(locksDir, `${projectName}.lock.json`);
      writeFileSync(lockPath, "invalid json");

      expect(() => {
        releaseExclusiveLock(projectName);
      }).not.toThrow();
    });
  });
});
