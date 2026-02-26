import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RestartCommand } from "./RestartCommand";
import { CloneCommand } from "./CloneCommand";
import { LogsCommand } from "./LogsCommand";
import { StatusCommand } from "./StatusCommand";
import { renderer } from "../ui/renderer";
import { getStatus, type StatusResult } from "../core/getStatus";
import type { Zapper } from "../core/Zapper";
import type { Context } from "../types/Context";

vi.mock("../core/getStatus", () => ({
  getStatus: vi.fn(),
}));

const mockedGetStatus = vi.mocked(getStatus);

describe("Multi-service command targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes all services to restart command", async () => {
    const restartProcesses = vi.fn().mockResolvedValue(undefined);
    const command = new RestartCommand();

    const result = await command.execute({
      zapper: { restartProcesses } as unknown as Zapper,
      service: ["api", "worker", "database"],
      options: {},
    });

    expect(restartProcesses).toHaveBeenCalledWith([
      "api",
      "worker",
      "database",
    ]);
    expect(result).toEqual({
      kind: "services.action",
      action: "restart",
      services: ["api", "worker", "database"],
    });
  });

  it("passes all services to clone command", async () => {
    const cloneRepos = vi.fn().mockResolvedValue(undefined);
    const command = new CloneCommand();

    const result = await command.execute({
      zapper: { cloneRepos } as unknown as Zapper,
      service: ["api", "web"],
      options: {},
    });

    expect(cloneRepos).toHaveBeenCalledWith(["api", "web"]);
    expect(result).toEqual({
      kind: "clone.completed",
      services: ["api", "web"],
    });
  });

  it("supports multiple services for logs with --no-follow", async () => {
    const showLogs = vi.fn().mockResolvedValue(undefined);
    const command = new LogsCommand();
    const infoSpy = vi.spyOn(renderer.log, "info").mockImplementation(() => {});

    await command.execute({
      zapper: { showLogs } as unknown as Zapper,
      service: ["api", "worker"],
      options: { follow: false },
    });

    expect(showLogs).toHaveBeenNthCalledWith(1, "api", false);
    expect(showLogs).toHaveBeenNthCalledWith(2, "worker", false);
    expect(infoSpy).toHaveBeenCalledWith("Showing logs for api");
    expect(infoSpy).toHaveBeenCalledWith("Showing logs for worker");
  });

  it("rejects multiple services for logs with follow enabled", async () => {
    const showLogs = vi.fn().mockResolvedValue(undefined);
    const command = new LogsCommand();

    await expect(
      command.execute({
        zapper: { showLogs } as unknown as Zapper,
        service: ["api", "worker"],
        options: { follow: true },
      }),
    ).rejects.toThrow(
      "Cannot follow logs for multiple services. Use --no-follow or request a single service.",
    );
    expect(showLogs).not.toHaveBeenCalled();
  });

  it("passes multiple services to status filtering", async () => {
    const statusResult: StatusResult = { native: [], docker: [] };
    const zapperContext: Context = {
      projectName: "test",
      projectRoot: "/tmp/test",
      envFiles: [],
      environments: [],
      processes: [],
      containers: [],
      tasks: [],
      links: [],
      profiles: [],
      state: {},
    };
    const getContext = vi.fn().mockReturnValue(zapperContext);
    mockedGetStatus.mockResolvedValue(statusResult);

    const command = new StatusCommand();
    const result = await command.execute({
      zapper: { getContext } as unknown as Zapper,
      service: ["api", "database"],
      options: { all: true },
    });

    expect(mockedGetStatus).toHaveBeenCalledWith(
      zapperContext,
      ["api", "database"],
      true,
    );
    expect(result).toEqual({
      kind: "status",
      statusResult,
      context: zapperContext,
    });
  });
});
