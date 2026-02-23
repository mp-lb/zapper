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
});
