import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpCommand } from "./UpCommand";
import type { Zapper } from "../core/Zapper";

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock("child_process", () => ({
  spawn: mockSpawn,
}));

function getOpenCommand(url: string): [string, string[]] {
  if (process.platform === "darwin") return ["open", [url]];
  if (process.platform === "win32") return ["cmd", ["/c", "start", "", url]];
  return ["xdg-open", [url]];
}

describe("UpCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the configured homepage after starting when --open is set", async () => {
    const startProcesses = vi.fn().mockResolvedValue({
      status: "success",
      action: "up",
      started: ["api"],
      stopped: [],
      failed: [],
    });
    const command = new UpCommand();

    const result = await command.execute({
      zapper: {
        startProcesses,
        getContext: () => ({
          projectName: "test",
          projectRoot: "/tmp/test",
          processes: [],
          containers: [],
          tasks: [],
          homepage: "http://localhost:3000",
          links: [],
          environments: [],
          profiles: [],
          state: {},
        }),
      } as unknown as Zapper,
      options: { open: true },
    });

    expect(startProcesses).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
    const [commandName, args] = getOpenCommand("http://localhost:3000");
    expect(mockSpawn).toHaveBeenCalledWith(commandName, args, {
      detached: true,
      stdio: "ignore",
    });
    expect(result).toEqual({
      kind: "services.action",
      action: "up",
      services: undefined,
      report: {
        status: "success",
        action: "up",
        started: ["api"],
        stopped: [],
        failed: [],
        opened: {
          status: "success",
          url: "http://localhost:3000",
        },
      },
    });
  });

  it("reports skipped open when no homepage is configured", async () => {
    const startProcesses = vi.fn().mockResolvedValue({
      status: "success",
      action: "up",
      started: [],
      stopped: [],
      failed: [],
    });
    const command = new UpCommand();

    const result = await command.execute({
      zapper: {
        startProcesses,
        getContext: () => ({
          projectName: "test",
          projectRoot: "/tmp/test",
          processes: [],
          containers: [],
          tasks: [],
          links: [],
          environments: [],
          profiles: [],
          state: {},
        }),
      } as unknown as Zapper,
      options: { open: true },
    });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "services.action",
      action: "up",
      services: undefined,
      report: {
        status: "success",
        action: "up",
        started: [],
        stopped: [],
        failed: [],
        opened: {
          status: "skipped",
          reason: "No homepage configured. Set `homepage` in zap.yaml.",
        },
      },
    });
  });
});
