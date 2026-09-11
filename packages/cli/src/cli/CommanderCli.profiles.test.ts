import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilesCommand, Zapper } from "@mp-lb/zapper-sdk";
import { CommanderCli } from "./CommanderCli";

describe("CommanderCli profile dispatch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Zapper.prototype, "loadConfig").mockResolvedValue();
    vi.spyOn(ProfilesCommand.prototype, "execute").mockResolvedValue();
  });

  it.each([
    [[], ["select"]],
    [["--json"], ["get"]],
    [["get"], ["get"]],
    [["current"], ["get"]],
    [
      ["set", "dev"],
      ["set", "dev"],
    ],
    [
      ["use", "dev"],
      ["set", "dev"],
    ],
  ])("dispatches profile %j to %j", async (args, service) => {
    await new CommanderCli().parse(["node", "zap", "profile", ...args]);
    expect(ProfilesCommand.prototype.execute).toHaveBeenCalledWith(
      expect.objectContaining({ service }),
    );
  });
});
