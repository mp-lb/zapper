import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AssignCommand } from "./AssignCommand";
import { CommandContext } from "./CommandHandler";
import { Zapper } from "../core/Zapper";
import { Context } from "../types/Context";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("AssignCommand", () => {
  let command: AssignCommand;
  let tempDir: string;

  beforeEach(() => {
    command = new AssignCommand();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "assign-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createMockContext = (
    overrides: Partial<Context> = {},
  ): CommandContext => {
    const mockZapper = {
      getContext: vi.fn().mockReturnValue({
        projectName: "test-project",
        projectRoot: tempDir,
        ports: ["FRONTEND_PORT", "BACKEND_PORT"],
        processes: [],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        environments: [],
        state: { lastUpdated: "2024-01-01T00:00:00.000Z" },
        ...overrides,
      }),
    } as unknown as Zapper;

    return {
      zapper: mockZapper,
      options: {},
    };
  };

  it("should return success result with assigned ports", async () => {
    const ctx = createMockContext();
    const result = await command.execute(ctx);

    expect(result).toBeDefined();
    expect(result?.kind).toBe("assign");
    expect(result?.ports).toHaveProperty("FRONTEND_PORT");
    expect(result?.ports).toHaveProperty("BACKEND_PORT");
  });

  it("should save ports to ports.json", async () => {
    const ctx = createMockContext();
    await command.execute(ctx);

    const portsPath = path.join(tempDir, ".zap", "ports.json");
    expect(fs.existsSync(portsPath)).toBe(true);

    const savedPorts = JSON.parse(fs.readFileSync(portsPath, "utf8"));
    expect(savedPorts).toHaveProperty("FRONTEND_PORT");
    expect(savedPorts).toHaveProperty("BACKEND_PORT");
  });

  it("should return empty ports for config without ports", async () => {
    const ctx = createMockContext({ ports: undefined });
    const result = await command.execute(ctx);

    expect(result?.kind).toBe("assign");
    expect(result?.ports).toEqual({});
  });

  it("should return empty ports for empty ports array", async () => {
    const ctx = createMockContext({ ports: [] });
    const result = await command.execute(ctx);

    expect(result?.kind).toBe("assign");
    expect(result?.ports).toEqual({});
  });

  it("should throw when context is not loaded", async () => {
    const mockZapper = {
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as Zapper;

    const ctx: CommandContext = {
      zapper: mockZapper,
      options: {},
    };

    await expect(command.execute(ctx)).rejects.toThrow("Context not loaded");
  });

  it("should generate unique ports", async () => {
    const ctx = createMockContext({
      ports: ["PORT_A", "PORT_B", "PORT_C", "PORT_D", "PORT_E"],
    });
    const result = await command.execute(ctx);

    const values = Object.values(result?.ports || {});
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(5);
  });

  it("should generate ports as strings", async () => {
    const ctx = createMockContext();
    const result = await command.execute(ctx);

    expect(typeof result?.ports.FRONTEND_PORT).toBe("string");
    expect(typeof result?.ports.BACKEND_PORT).toBe("string");
  });

  it("should overwrite existing ports.json on re-assignment", async () => {
    // First assignment
    const ctx1 = createMockContext();
    const result1 = await command.execute(ctx1);

    // Second assignment
    const ctx2 = createMockContext();
    const result2 = await command.execute(ctx2);

    // Ports should be different (very unlikely to get same random ports)
    expect(result1?.ports).not.toEqual(result2?.ports);

    // Verify the file was overwritten
    const portsPath = path.join(tempDir, ".zap", "ports.json");
    const savedPorts = JSON.parse(fs.readFileSync(portsPath, "utf8"));
    expect(savedPorts).toEqual(result2?.ports);
  });

  it("should generate ports in valid dynamic range (49152-65535)", async () => {
    const ctx = createMockContext({
      ports: ["PORT_A", "PORT_B", "PORT_C", "PORT_D", "PORT_E"],
    });
    const result = await command.execute(ctx);

    for (const portValue of Object.values(result?.ports || {})) {
      const port = parseInt(portValue as string, 10);
      expect(port).toBeGreaterThanOrEqual(49152);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });
});
