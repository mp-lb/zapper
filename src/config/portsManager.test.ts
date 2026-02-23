import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  loadPorts,
  savePorts,
  clearPorts,
  assignRandomPorts,
  getPortsPath,
  generateRandomPort,
} from "./portsManager";

describe("portsManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ports-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadPorts", () => {
    it("returns empty object when ports file does not exist", () => {
      const ports = loadPorts(tempDir);
      expect(ports).toEqual({});
    });

    it("loads ports from existing ports.json", () => {
      const portsPath = path.join(tempDir, ".zap", "ports.json");
      fs.mkdirSync(path.dirname(portsPath), { recursive: true });
      fs.writeFileSync(
        portsPath,
        JSON.stringify({ PORT_1: "1234", PORT_2: "5678" }),
      );

      const ports = loadPorts(tempDir);
      expect(ports).toEqual({ PORT_1: "1234", PORT_2: "5678" });
    });

    it("returns empty object for malformed JSON", () => {
      const portsPath = path.join(tempDir, ".zap", "ports.json");
      fs.mkdirSync(path.dirname(portsPath), { recursive: true });
      fs.writeFileSync(portsPath, "not valid json");

      const ports = loadPorts(tempDir);
      expect(ports).toEqual({});
    });
  });

  describe("savePorts", () => {
    it("creates .zap directory if it does not exist", () => {
      const ports = { PORT_1: "1234" };
      savePorts(tempDir, ports);

      expect(fs.existsSync(path.join(tempDir, ".zap"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".zap", "ports.json"))).toBe(
        true,
      );
    });

    it("saves ports to ports.json", () => {
      const ports = { PORT_1: "1234", PORT_2: "5678" };
      savePorts(tempDir, ports);

      const content = fs.readFileSync(
        path.join(tempDir, ".zap", "ports.json"),
        "utf8",
      );
      expect(JSON.parse(content)).toEqual(ports);
    });
  });

  describe("clearPorts", () => {
    it("deletes ports.json if it exists", () => {
      const portsPath = path.join(tempDir, ".zap", "ports.json");
      fs.mkdirSync(path.dirname(portsPath), { recursive: true });
      fs.writeFileSync(portsPath, JSON.stringify({ PORT_1: "1234" }));

      clearPorts(tempDir);

      expect(fs.existsSync(portsPath)).toBe(false);
    });

    it("does nothing if ports.json does not exist", () => {
      // Should not throw
      clearPorts(tempDir);
    });
  });

  describe("generateRandomPort", () => {
    it("generates a port in the valid range", () => {
      for (let i = 0; i < 100; i++) {
        const port = generateRandomPort();
        expect(port).toBeGreaterThanOrEqual(49152);
        expect(port).toBeLessThanOrEqual(65535);
      }
    });
  });

  describe("assignRandomPorts", () => {
    it("generates unique ports for each name", () => {
      const portNames = ["PORT_A", "PORT_B", "PORT_C"];
      const ports = assignRandomPorts(portNames);

      expect(Object.keys(ports)).toHaveLength(3);
      expect(ports).toHaveProperty("PORT_A");
      expect(ports).toHaveProperty("PORT_B");
      expect(ports).toHaveProperty("PORT_C");

      const values = Object.values(ports);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(3);
    });

    it("returns empty object for empty input", () => {
      const ports = assignRandomPorts([]);
      expect(ports).toEqual({});
    });

    it("generates port values as strings", () => {
      const ports = assignRandomPorts(["PORT_A"]);
      expect(typeof ports.PORT_A).toBe("string");
      expect(parseInt(ports.PORT_A, 10)).not.toBeNaN();
    });
  });

  describe("getPortsPath", () => {
    it("returns the path to ports.json", () => {
      const portsPath = getPortsPath(tempDir);
      expect(portsPath).toBe(path.join(tempDir, ".zap", "ports.json"));
    });
  });

  describe("integration scenarios", () => {
    it("should handle save after load when ports file doesn't exist", () => {
      // Load from non-existent file
      const loaded = loadPorts(tempDir);
      expect(loaded).toEqual({});

      // Save new ports
      const newPorts = { PORT_A: "1234" };
      savePorts(tempDir, newPorts);

      // Load again to verify
      const reloaded = loadPorts(tempDir);
      expect(reloaded).toEqual(newPorts);
    });

    it("should completely replace ports on re-save", () => {
      // First save
      savePorts(tempDir, { PORT_A: "1111", PORT_B: "2222" });

      // Second save with different ports
      savePorts(tempDir, { PORT_C: "3333" });

      // Verify only PORT_C exists
      const loaded = loadPorts(tempDir);
      expect(loaded).toEqual({ PORT_C: "3333" });
      expect(loaded).not.toHaveProperty("PORT_A");
      expect(loaded).not.toHaveProperty("PORT_B");
    });

    it("should handle clearPorts when file doesn't exist", () => {
      // Should not throw
      clearPorts(tempDir);
      clearPorts(tempDir); // Call twice to verify idempotency
    });

    it("should handle savePorts with empty object", () => {
      savePorts(tempDir, {});
      const loaded = loadPorts(tempDir);
      expect(loaded).toEqual({});
    });
  });

  describe("clearPorts for reset command", () => {
    it("should remove ports.json when clearPorts is called", () => {
      // Create ports file
      savePorts(tempDir, { PORT_A: "1234", PORT_B: "5678" });
      const portsPath = path.join(tempDir, ".zap", "ports.json");
      expect(fs.existsSync(portsPath)).toBe(true);

      // Clear ports
      clearPorts(tempDir);

      // Verify it's gone
      expect(fs.existsSync(portsPath)).toBe(false);
    });

    it("should allow re-creation after clear", () => {
      // Create, clear, recreate
      savePorts(tempDir, { PORT_A: "1111" });
      clearPorts(tempDir);
      savePorts(tempDir, { PORT_B: "2222" });

      const loaded = loadPorts(tempDir);
      expect(loaded).toEqual({ PORT_B: "2222" });
    });
  });
});
