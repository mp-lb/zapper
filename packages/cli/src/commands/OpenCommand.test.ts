import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenCommand } from "./OpenCommand";
import type { ProjectLinkResult } from "./CommandResult";
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

function zapperWithLinks(): Zapper {
  return {
    getContext: () => ({
      projectName: "test",
      projectRoot: "/tmp/test",
      processes: [],
      containers: [],
      tasks: [],
      homepage: "http://localhost:3000",
      links: [
        { name: "API Docs", url: "http://localhost:3001/docs" },
        { name: "Storybook", url: "http://localhost:6006" },
      ],
      environments: [],
      profiles: [],
      state: {},
    }),
  } as unknown as Zapper;
}

describe("OpenCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prompts with homepage first and opens the selected link", async () => {
    const selectLink = vi.fn(async (links: ProjectLinkResult[]) => links[1]);
    const command = new OpenCommand(selectLink);

    const result = await command.execute({
      zapper: zapperWithLinks(),
      options: {},
    });

    expect(selectLink).toHaveBeenCalledWith([
      {
        name: "Home",
        url: "http://localhost:3000",
        isHomepage: true,
      },
      {
        name: "API Docs",
        url: "http://localhost:3001/docs",
        isHomepage: false,
      },
      {
        name: "Storybook",
        url: "http://localhost:6006",
        isHomepage: false,
      },
    ]);
    expect(result).toMatchObject({
      kind: "launch.opened",
      url: "http://localhost:3001/docs",
    });
    expect(mockExec).toHaveBeenCalledWith(
      `${getOpenCommand()} "http://localhost:3001/docs"`,
    );
  });

  it("opens the homepage without prompting in non-interactive mode", async () => {
    const selectLink = vi.fn();
    const command = new OpenCommand(selectLink);

    const result = await command.execute({
      zapper: zapperWithLinks(),
      options: { nonInteractive: true },
    });

    expect(selectLink).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "launch.opened",
      url: "http://localhost:3000",
    });
    expect(mockExec).toHaveBeenCalledWith(
      `${getOpenCommand()} "http://localhost:3000"`,
    );
  });

  it("opens directly when homepage is the only available link", async () => {
    const selectLink = vi.fn();
    const command = new OpenCommand(selectLink);
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

    expect(selectLink).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "launch.opened",
      url: "http://localhost:3000",
    });
    expect(mockExec).toHaveBeenCalledWith(
      `${getOpenCommand()} "http://localhost:3000"`,
    );
  });

  it("opens a named link without prompting", async () => {
    const selectLink = vi.fn();
    const command = new OpenCommand(selectLink);

    const result = await command.execute({
      zapper: zapperWithLinks(),
      service: "Storybook",
      options: {},
    });

    expect(selectLink).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "launch.opened",
      url: "http://localhost:6006",
    });
  });

  it("does not prompt in json mode", async () => {
    const selectLink = vi.fn();
    const command = new OpenCommand(selectLink);

    await command.execute({
      zapper: zapperWithLinks(),
      options: { json: true },
    });

    expect(selectLink).not.toHaveBeenCalled();
  });

  it("reports empty metadata before prompting", async () => {
    const command = new OpenCommand(vi.fn());
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
    ).rejects.toThrow("No links configured");
  });
});
