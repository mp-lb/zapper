import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InitCommand } from "./InitCommand";
import { CommandContext } from "./CommandHandler";
import { Zapper } from "../core/Zapper";
import { Context } from "../types/Context";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("InitCommand", () => {
  let command: InitCommand;
  let tempDir: string;

  beforeEach(() => {
    command = new InitCommand();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createMockContext = (
    overrides: Partial<Context> = {},
    options: Record<string, unknown> = {},
  ): CommandContext => {
    const mockContext: Context = {
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
    };

    const mockZapper = {
      getContext: vi.fn().mockReturnValue(mockContext),
    } as unknown as Zapper;

    return {
      zapper: mockZapper,
      options,
    };
  };

  it("initializes ports and main instance by default", async () => {
    const ctx = createMockContext();
    const result = await command.execute(ctx);

    expect(result.kind).toBe("init");
    expect(result.isolated).toBe(false);
    expect(result.instanceId).toBeUndefined();
    expect(result.ports).toHaveProperty("FRONTEND_PORT");
    expect(result.ports).toHaveProperty("BACKEND_PORT");
  });

  it("initializes isolated mode with generated instance id", async () => {
    const ctx = createMockContext({}, { instance: true });
    const result = await command.execute(ctx);

    expect(result.kind).toBe("init");
    expect(result.isolated).toBe(true);
    expect(result.instanceId).toMatch(/^[a-z0-9]{6}$/);
  });

  it("preserves existing ports unless --random is used", async () => {
    const first = await command.execute(createMockContext());
    const second = await command.execute(createMockContext());

    expect(second.ports).toEqual(first.ports);

    const randomized = await command.execute(
      createMockContext({}, { random: true }),
    );

    expect(randomized.ports).not.toEqual(first.ports);
  });

  it("updates only newly added port names", async () => {
    const first = await command.execute(createMockContext());

    const second = await command.execute(
      createMockContext({ ports: ["FRONTEND_PORT", "BACKEND_PORT", "API_PORT"] }),
    );

    expect(second.ports.FRONTEND_PORT).toBe(first.ports.FRONTEND_PORT);
    expect(second.ports.BACKEND_PORT).toBe(first.ports.BACKEND_PORT);
    expect(second.ports.API_PORT).toBeDefined();
  });

  it("removes ports that are no longer configured", async () => {
    await command.execute(
      createMockContext({ ports: ["PORT_A", "PORT_B", "PORT_C"] }),
    );

    const second = await command.execute(
      createMockContext({ ports: ["PORT_A"] }),
    );

    expect(second.ports).toEqual({ PORT_A: second.ports.PORT_A });
  });

  it("warns in a git worktree when initialized without -i", async () => {
    fs.writeFileSync(path.join(tempDir, ".git"), "gitdir: /tmp/main/.git/worktrees/wt");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await command.execute(createMockContext());

    expect(result.warningShown).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });
});
