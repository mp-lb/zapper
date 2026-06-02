import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenCommand } from "./OpenCommand";
import type { ProjectLinkResult } from "./CommandResult";
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

    const [commandName, args] = getOpenCommand("http://localhost:3001/docs");
    expect(mockSpawn).toHaveBeenCalledWith(commandName, args, {
      detached: true,
      stdio: "ignore",
    });
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

    const [commandName, args] = getOpenCommand("http://localhost:3000");
    expect(mockSpawn).toHaveBeenCalledWith(commandName, args, {
      detached: true,
      stdio: "ignore",
    });
  });

  it("opens the homepage without prompting with --home", async () => {
    const selectLink = vi.fn();
    const command = new OpenCommand(selectLink);

    const result = await command.execute({
      zapper: zapperWithLinks(),
      options: { home: true },
    });

    expect(selectLink).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "launch.opened",
      url: "http://localhost:3000",
    });

    const [commandName, args] = getOpenCommand("http://localhost:3000");
    expect(mockSpawn).toHaveBeenCalledWith(commandName, args, {
      detached: true,
      stdio: "ignore",
    });
  });

  it("rejects --home with a link name", async () => {
    const command = new OpenCommand(vi.fn());

    await expect(
      command.execute({
        zapper: zapperWithLinks(),
        service: "Storybook",
        options: { home: true },
      }),
    ).rejects.toThrow("Open command accepts either --home or a link name");
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

    const [commandName, args] = getOpenCommand("http://localhost:3000");
    expect(mockSpawn).toHaveBeenCalledWith(commandName, args, {
      detached: true,
      stdio: "ignore",
    });
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
