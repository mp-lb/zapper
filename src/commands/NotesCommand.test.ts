import { describe, it, expect } from "vitest";
import { NotesCommand } from "./NotesCommand";
import type { Zapper } from "../core/Zapper";

describe("NotesCommand", () => {
  it("prints notes value", async () => {
    const command = new NotesCommand();
    const zapper = {
      getContext: () => ({
        projectName: "test",
        projectRoot: "/tmp/test",
        processes: [],
        containers: [],
        tasks: [],
        notes: "Deploy URL: http://localhost:3000",
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
      kind: "notes.value",
      value: "Deploy URL: http://localhost:3000",
    });
  });

  it("throws when notes is not configured", async () => {
    const command = new NotesCommand();
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
    ).rejects.toThrow("No notes configured. Set `notes` in zap.yaml");
  });
});
