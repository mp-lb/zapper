import { describe, it, expect } from "vitest";
import { HomeCommand } from "./HomeCommand";
import type { Zapper } from "../core/Zapper";

describe("HomeCommand", () => {
  it("prints homepage value", async () => {
    const command = new HomeCommand();
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
      kind: "home.value",
      value: "http://localhost:3000",
    });
  });

  it("throws when homepage is not configured", async () => {
    const command = new HomeCommand();
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
    ).rejects.toThrow("No homepage configured. Set `homepage` in zap.yaml");
  });
});
