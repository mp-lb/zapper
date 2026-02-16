import { beforeEach, describe, expect, it, vi } from "vitest";
import { KillCommand } from "./KillCommand";
import { confirm } from "../utils/confirm";
import type { ProjectKillTargets, Zapper } from "../core/Zapper";

vi.mock("../utils/confirm", () => ({
  confirm: vi.fn(),
}));

const mockedConfirm = vi.mocked(confirm);

describe("KillCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aborted when confirmation is declined", async () => {
    mockedConfirm.mockResolvedValue(false);

    const targets: ProjectKillTargets = {
      projectName: "myproj",
      prefix: "zap.myproj",
      pm2: ["zap.myproj.api"],
      containers: ["zap.myproj.redis"],
    };

    const getProjectKillTargets = vi.fn().mockResolvedValue(targets);
    const killProjectResources = vi.fn();
    const command = new KillCommand();

    const result = await command.execute({
      zapper: {
        getProjectKillTargets,
        killProjectResources,
      } as unknown as Zapper,
      options: {},
    });

    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.stringContaining('prefix "zap.myproj."'),
      { defaultYes: false, force: undefined },
    );
    expect(killProjectResources).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "kill",
      status: "aborted",
      projectName: "myproj",
      prefix: "zap.myproj",
      pm2: ["zap.myproj.api"],
      containers: ["zap.myproj.redis"],
    });
  });

  it("kills project resources when confirmed", async () => {
    mockedConfirm.mockResolvedValue(true);

    const targets: ProjectKillTargets = {
      projectName: "myproj",
      prefix: "zap.myproj",
      pm2: ["zap.myproj.api", "zap.myproj.worker"],
      containers: ["zap.myproj.redis"],
    };

    const getProjectKillTargets = vi.fn().mockResolvedValue(targets);
    const killProjectResources = vi.fn().mockResolvedValue(targets);
    const command = new KillCommand();

    const result = await command.execute({
      zapper: {
        getProjectKillTargets,
        killProjectResources,
      } as unknown as Zapper,
      options: { force: true },
    });

    expect(mockedConfirm).toHaveBeenCalledWith(expect.any(String), {
      defaultYes: false,
      force: true,
    });
    expect(killProjectResources).toHaveBeenCalledWith(targets);
    expect(result).toEqual({
      kind: "kill",
      status: "completed",
      projectName: "myproj",
      prefix: "zap.myproj",
      pm2: ["zap.myproj.api", "zap.myproj.worker"],
      containers: ["zap.myproj.redis"],
    });
  });
});
