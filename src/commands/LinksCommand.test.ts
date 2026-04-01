import { describe, it, expect } from "vitest";
import { LinksCommand } from "./LinksCommand";
import type { Zapper } from "../core/Zapper";

describe("LinksCommand", () => {
  it("lists homepage first, followed by configured links", async () => {
    const command = new LinksCommand();
    const zapper = {
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
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      options: {},
    });

    expect(result).toEqual({
      kind: "links.list",
      links: [
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
      ],
    });
  });

  it("returns an empty list when no homepage or links are configured", async () => {
    const command = new LinksCommand();
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

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      options: {},
    });

    expect(result).toEqual({
      kind: "links.list",
      links: [],
    });
  });
});
