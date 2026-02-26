import { describe, it, expect, vi, beforeEach } from "vitest";
import { LaunchCommand } from "./LaunchCommand";
import type { Zapper } from "../core/Zapper";

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

vi.mock("child_process", () => ({
  exec: mockExec,
}));

function getOpenCommand(): string {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "start";
  return "xdg-open";
}

describe("LaunchCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens homepage when no name is provided", async () => {
    const command = new LaunchCommand();
    const zapper = {
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
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      options: {},
    });

    expect(result).toEqual({
      kind: "launch.opened",
      url: "http://localhost:3000",
    });
    expect(mockExec).toHaveBeenCalledWith(
      `${getOpenCommand()} "http://localhost:3000"`,
    );
  });

  it("opens a named project link", async () => {
    const command = new LaunchCommand();
    const zapper = {
      getContext: () => ({
        projectName: "test",
        projectRoot: "/tmp/test",
        processes: [],
        containers: [],
        tasks: [],
        homepage: "http://localhost:3000",
        links: [{ name: "docs", url: "http://localhost:3001/docs" }],
        environments: [],
        profiles: [],
        state: {},
      }),
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: "docs",
      options: {},
    });

    expect(result).toEqual({
      kind: "launch.opened",
      url: "http://localhost:3001/docs",
    });
    expect(mockExec).toHaveBeenCalledWith(
      `${getOpenCommand()} "http://localhost:3001/docs"`,
    );
  });

  it("throws when no homepage is configured and no name is provided", async () => {
    const command = new LaunchCommand();
    const zapper = {
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
    };

    await expect(
      command.execute({
        zapper: zapper as unknown as Zapper,
        options: {},
      }),
    ).rejects.toThrow(
      "No homepage configured. Set `homepage` in zap.yaml or provide a link name: zap launch <name>",
    );
  });

  it("throws when named link does not exist", async () => {
    const command = new LaunchCommand();
    const zapper = {
      getContext: () => ({
        projectName: "test",
        projectRoot: "/tmp/test",
        processes: [],
        containers: [],
        tasks: [],
        homepage: "http://localhost:3000",
        links: [{ name: "docs", url: "http://localhost:3001/docs" }],
        environments: [],
        profiles: [],
        state: {},
      }),
    };

    await expect(
      command.execute({
        zapper: zapper as unknown as Zapper,
        service: "api",
        options: {},
      }),
    ).rejects.toThrow("No link found for: api");
  });
});
