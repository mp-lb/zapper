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
  initializePorts,
} from "./portsManager";
import { loadState } from "./stateLoader";

describe("portsManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ports-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty object when no ports are stored", () => {
    expect(loadPorts(tempDir)).toEqual({});
  });

  it("saves and loads ports from state.json", () => {
    const ports = { PORT_1: "1234", PORT_2: "5678" };
    savePorts(tempDir, ports);

    expect(loadPorts(tempDir)).toEqual(ports);
    expect(loadState(tempDir).ports).toEqual(ports);
  });

  it("clearPorts removes assigned ports", () => {
    savePorts(tempDir, { PORT_1: "1234" });
    clearPorts(tempDir);
    expect(loadPorts(tempDir)).toEqual({});
  });

  it("generates ports in valid range", () => {
    for (let i = 0; i < 100; i++) {
      const port = generateRandomPort();
      expect(port).toBeGreaterThanOrEqual(49152);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });

  it("assignRandomPorts creates unique values", () => {
    const ports = assignRandomPorts(["PORT_A", "PORT_B", "PORT_C"]);
    const values = Object.values(ports);
    expect(new Set(values).size).toBe(3);
  });

  it("initializePorts preserves existing assignments and adds new ones", () => {
    const first = initializePorts(tempDir, ["PORT_A", "PORT_B"]);
    const second = initializePorts(tempDir, ["PORT_A", "PORT_B", "PORT_C"]);

    expect(second.PORT_A).toBe(first.PORT_A);
    expect(second.PORT_B).toBe(first.PORT_B);
    expect(second.PORT_C).toBeDefined();
  });

  it("initializePorts removes stale assignments", () => {
    initializePorts(tempDir, ["PORT_A", "PORT_B"]);
    const next = initializePorts(tempDir, ["PORT_B"]);

    expect(next).toEqual({ PORT_B: next.PORT_B });
  });

  it("initializePorts randomizes all ports when requested", () => {
    const first = initializePorts(tempDir, ["PORT_A", "PORT_B"]);
    const second = initializePorts(tempDir, ["PORT_A", "PORT_B"], {
      randomizeAll: true,
    });

    expect(second).not.toEqual(first);
  });

  it("returns the state.json path", () => {
    expect(getPortsPath(tempDir)).toBe(path.join(tempDir, ".zap", "state.json"));
  });
});
