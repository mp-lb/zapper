import { TaskCommand } from "./TaskCommand";
import { Zapper } from "../core/Zapper";
import { TaskNotFoundError } from "../errors";
import { vi, describe, it, expect } from "vitest";
import { Context } from "../types";

describe("TaskCommand", () => {
  it("throws TaskNotFoundError when listing params for an unknown task", async () => {
    const zapper = new Zapper();

    const mockContext: Context = {
      projectName: "test",
      profiles: [],
      processes: [],
      containers: [],
      tasks: [{ name: "build", cmds: ["pnpm build"] }],
      environments: [],
      links: [],
      instanceKey: "default",
      state: {},
      projectRoot: "/test",
    };

    vi.spyOn(zapper, "getContext").mockReturnValue(mockContext);

    const command = new TaskCommand();
    await expect(
      command.execute({
        zapper,
        service: "missing",
        options: { listParams: true },
      }),
    ).rejects.toThrow(TaskNotFoundError);
  });

  it("lists params for a task alias", async () => {
    const zapper = new Zapper();

    const mockContext: Context = {
      projectName: "test",
      profiles: [],
      processes: [],
      containers: [],
      tasks: [
        {
          name: "build",
          aliases: ["b"],
          cmds: ["pnpm build --target={{target}}"],
          params: [{ name: "target", default: "dev" }],
        },
      ],
      environments: [],
      links: [],
      instanceKey: "default",
      state: {},
      projectRoot: "/test",
    };

    vi.spyOn(zapper, "getContext").mockReturnValue(mockContext);
    vi.spyOn(zapper, "resolveTaskName").mockReturnValue("build");

    const command = new TaskCommand();
    await expect(
      command.execute({
        zapper,
        service: "b",
        options: { listParams: true },
      }),
    ).resolves.toEqual({
      kind: "tasks.params",
      task: mockContext.tasks[0],
      delimiters: undefined,
    });
  });

  it("passes interactive prompting option when running a task", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "runTask").mockResolvedValue(undefined);

    const command = new TaskCommand();
    await command.execute({
      zapper,
      service: "deploy",
      options: { interactive: true },
      taskParams: { named: {}, rest: [] },
    });

    expect(zapper.runTask).toHaveBeenCalledWith(
      "deploy",
      { named: {}, rest: [] },
      { force: false, promptMissingParams: true },
    );
  });
});
