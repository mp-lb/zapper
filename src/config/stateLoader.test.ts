import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadState,
  saveState,
  updateServiceState,
  clearServiceState,
} from "./stateLoader";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";

// Mock logger to avoid console output during tests
vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    setSink: vi.fn(),
  },
}));

describe("stateLoader", () => {
  let testDir: string;
  let testCounter = 0;

  beforeEach(() => {
    testCounter++;
    testDir = path.join(
      tmpdir(),
      `zapper-state-test-${Date.now()}-${testCounter}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe("loadState", () => {
    it("should return default state when file doesn't exist", () => {
      const state = loadState(testDir);

      expect(state).toEqual({
        lastUpdated: expect.any(String),
      });
      expect(new Date(state.lastUpdated!)).toBeInstanceOf(Date);
    });

    it("should read and validate existing state.json", () => {
      const zapDir = path.join(testDir, ".zap");
      const statePath = path.join(zapDir, "state.json");

      mkdirSync(zapDir);
      const existingState = {
        lastUpdated: "2024-01-01T00:00:00.000Z",
        activeProfile: "dev",
        services: {
          "web-server": {
            startPid: 1234,
            startRequestedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };
      writeFileSync(statePath, JSON.stringify(existingState, null, 2));

      const state = loadState(testDir);

      expect(state).toEqual(existingState);
    });

    it("should handle corrupt JSON gracefully", () => {
      const zapDir = path.join(testDir, ".zap");
      const statePath = path.join(zapDir, "state.json");

      mkdirSync(zapDir);
      writeFileSync(statePath, "invalid json {");

      const state = loadState(testDir);

      expect(state).toEqual({
        lastUpdated: expect.any(String),
      });
    });

    it("should handle invalid state schema gracefully", () => {
      const zapDir = path.join(testDir, ".zap");
      const statePath = path.join(zapDir, "state.json");

      mkdirSync(zapDir);
      const invalidState = {
        lastUpdated: 123, // Should be string
        services: {
          "test-service": {
            startPid: "not a number", // Should be number
          },
        },
      };
      writeFileSync(statePath, JSON.stringify(invalidState));

      const state = loadState(testDir);

      expect(state).toEqual({
        lastUpdated: expect.any(String),
      });
    });

    it("should handle missing properties gracefully", () => {
      const zapDir = path.join(testDir, ".zap");
      const statePath = path.join(zapDir, "state.json");

      mkdirSync(zapDir);
      const minimalState = {};
      writeFileSync(statePath, JSON.stringify(minimalState));

      const state = loadState(testDir);

      // Empty object is valid according to schema (all fields optional)
      expect(state).toEqual({});
    });
  });

  describe("saveState", () => {
    it("should create .zap directory if needed", () => {
      const zapDir = path.join(testDir, ".zap");
      expect(existsSync(zapDir)).toBe(false);

      saveState(testDir, { activeProfile: "test" });

      expect(existsSync(zapDir)).toBe(true);
      expect(existsSync(path.join(zapDir, "state.json"))).toBe(true);
    });

    it("should merge top-level properties with existing state", () => {
      // First, save an initial state
      saveState(testDir, {
        activeProfile: "dev",
        services: {
          service1: {
            startPid: 1234,
          },
        },
      });

      // Then, save a partial update that adds activeEnvironment but preserves activeProfile
      saveState(testDir, {
        activeEnvironment: "production",
      });

      const state = loadState(testDir);

      expect(state).toMatchObject({
        activeProfile: "dev",
        activeEnvironment: "production",
        services: {
          service1: {
            startPid: 1234,
          },
        },
      });
    });

    it("should replace services object when provided", () => {
      // First, save an initial state
      saveState(testDir, {
        activeProfile: "dev",
        services: {
          service1: {
            startPid: 1234,
          },
        },
      });

      // Then, save with a new services object (this replaces the entire services object)
      saveState(testDir, {
        services: {
          service2: {
            startPid: 5678,
          },
        },
      });

      const state = loadState(testDir);

      expect(state).toMatchObject({
        activeProfile: "dev",
        services: {
          service2: {
            startPid: 5678,
          },
        },
      });
    });

    it("should write lastUpdated timestamp", () => {
      const beforeSave = new Date();
      saveState(testDir, { activeProfile: "test" });
      const afterSave = new Date();

      const state = loadState(testDir);
      const timestamp = new Date(state.lastUpdated!);

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterSave.getTime());
    });

    it("should validate state before saving", () => {
      // This should throw because the state doesn't match the schema
      expect(() => {
        saveState(testDir, {
          services: {
            test: {
              startPid: "not a number" as unknown as number, // Invalid type for testing
            },
          },
        });
      }).toThrow();
    });

    it("should overwrite existing services with same name", () => {
      // Save initial state
      saveState(testDir, {
        services: {
          "web-server": {
            startPid: 1234,
            startRequestedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      });

      // Update the same service
      saveState(testDir, {
        services: {
          "web-server": {
            startPid: 5678,
          },
        },
      });

      const state = loadState(testDir);

      expect(state.services?.["web-server"]).toEqual({
        startPid: 5678,
      });
    });
  });

  describe("updateServiceState", () => {
    it("should add a new service entry", () => {
      updateServiceState(testDir, "new-service", {
        startPid: 9999,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });

      const state = loadState(testDir);

      expect(state.services?.["new-service"]).toEqual({
        startPid: 9999,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should update existing service entry", () => {
      // First, create a service
      updateServiceState(testDir, "test-service", {
        startPid: 1234,
      });

      // Then update it
      updateServiceState(testDir, "test-service", {
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });

      const state = loadState(testDir);

      expect(state.services?.["test-service"]).toEqual({
        startPid: 1234,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should preserve other services when updating one", () => {
      // Create multiple services
      updateServiceState(testDir, "service1", { startPid: 1111 });
      updateServiceState(testDir, "service2", { startPid: 2222 });

      // Update one service
      updateServiceState(testDir, "service1", {
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });

      const state = loadState(testDir);

      expect(state.services).toEqual({
        service1: {
          startPid: 1111,
          startRequestedAt: "2024-01-01T00:00:00.000Z",
        },
        service2: {
          startPid: 2222,
        },
      });
    });

    it("should handle partial updates to service state", () => {
      // Create service with multiple properties
      updateServiceState(testDir, "test-service", {
        startPid: 1234,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });

      // Update only one property
      updateServiceState(testDir, "test-service", {
        startPid: 5678,
      });

      const state = loadState(testDir);

      expect(state.services?.["test-service"]).toEqual({
        startPid: 5678,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });
    });
  });

  describe("clearServiceState", () => {
    it("should remove a service entry", () => {
      // Create multiple services
      updateServiceState(testDir, "service1", { startPid: 1111 });
      updateServiceState(testDir, "service2", { startPid: 2222 });

      // Remove one service
      clearServiceState(testDir, "service1");

      const state = loadState(testDir);

      expect(state.services).toEqual({
        service2: {
          startPid: 2222,
        },
      });
    });

    it("should handle removing non-existent service gracefully", () => {
      // Create one service
      updateServiceState(testDir, "service1", { startPid: 1111 });

      // Try to remove non-existent service
      clearServiceState(testDir, "non-existent");

      const state = loadState(testDir);

      expect(state.services).toEqual({
        service1: {
          startPid: 1111,
        },
      });
    });

    it("should handle clearing from empty state", () => {
      // Try to clear from empty state
      clearServiceState(testDir, "any-service");

      const state = loadState(testDir);

      expect(state.services).toEqual({});
    });
  });

  describe("round-trip consistency", () => {
    it("should maintain state integrity through save and load cycles", () => {
      const originalState = {
        activeProfile: "development",
        activeEnvironment: "local",
        services: {
          "web-server": {
            startPid: 1234,
            startRequestedAt: "2024-01-01T12:00:00.000Z",
          },
          "api-server": {
            startPid: 5678,
          },
          database: {
            startRequestedAt: "2024-01-01T12:01:00.000Z",
          },
        },
      };

      // Save the state
      saveState(testDir, originalState);

      // Load it back
      const loadedState = loadState(testDir);

      // Should match original (except lastUpdated will be different)
      expect(loadedState).toMatchObject(originalState);
      expect(loadedState.lastUpdated).toBeDefined();
    });

    it("should handle multiple save/load cycles correctly", () => {
      // Initial save
      saveState(testDir, { activeProfile: "dev" });

      // First load and update
      let state = loadState(testDir);
      saveState(testDir, { ...state, activeEnvironment: "test" });

      // Second load and update
      state = loadState(testDir);
      updateServiceState(testDir, "service1", { startPid: 1234 });

      // Third load and update
      state = loadState(testDir);
      updateServiceState(testDir, "service2", { startPid: 5678 });

      // Final verification
      state = loadState(testDir);
      expect(state).toMatchObject({
        activeProfile: "dev",
        activeEnvironment: "test",
        services: {
          service1: { startPid: 1234 },
          service2: { startPid: 5678 },
        },
      });
    });

    it("should preserve state file formatting", () => {
      const testState = {
        activeProfile: "test",
        services: {
          "test-service": {
            startPid: 1234,
          },
        },
      };

      saveState(testDir, testState);

      const statePath = path.join(testDir, ".zap", "state.json");
      const fileContent = readFileSync(statePath, "utf-8");

      // Should be properly formatted JSON with 2-space indentation
      const parsedContent = JSON.parse(fileContent);
      expect(typeof parsedContent).toBe("object");
      expect(fileContent).toContain("  "); // Has indentation
      expect(fileContent).not.toContain("\t"); // No tabs
    });
  });

  describe("concurrent operations", () => {
    it("should handle rapid successive updates correctly", () => {
      // Simulate rapid updates to the same service
      updateServiceState(testDir, "test-service", { startPid: 1111 });
      updateServiceState(testDir, "test-service", {
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });
      updateServiceState(testDir, "test-service", { startPid: 2222 });

      const state = loadState(testDir);

      expect(state.services?.["test-service"]).toEqual({
        startPid: 2222,
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should handle updates to different services correctly", () => {
      // Update multiple services rapidly
      updateServiceState(testDir, "service1", { startPid: 1111 });
      updateServiceState(testDir, "service2", { startPid: 2222 });
      updateServiceState(testDir, "service3", { startPid: 3333 });

      // Clear one and update another
      clearServiceState(testDir, "service2");
      updateServiceState(testDir, "service1", {
        startRequestedAt: "2024-01-01T00:00:00.000Z",
      });

      const state = loadState(testDir);

      expect(state.services).toEqual({
        service1: {
          startPid: 1111,
          startRequestedAt: "2024-01-01T00:00:00.000Z",
        },
        service3: {
          startPid: 3333,
        },
      });
    });
  });
});
