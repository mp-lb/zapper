import { ProfilesCommand } from "./ProfilesCommand";
import { Zapper } from "../core/Zapper";
import { vi, describe, it, expect } from "vitest";
import { Context } from "../types/index";
import { saveState } from "../config/stateLoader";

vi.mock("../config/stateLoader", async () => {
  const actual = await vi.importActual<typeof import("../config/stateLoader")>(
    "../config/stateLoader",
  );

  return {
    ...actual,
    saveState: vi.fn(),
  };
});

describe("ProfilesCommand", () => {
  function createMockContext(overrides: Partial<Context> = {}): Context {
    return {
      projectName: "test",
      profiles: ["default", "e2e", "proddata"],
      profile: {
        name: "default",
        envFiles: [],
        services: "*",
        isolate: false,
      },
      processes: [],
      containers: [],
      tasks: [],
      environments: [],
      links: [],
      instanceKey: "default",
      state: {},
      projectRoot: "/test",
      ...overrides,
    };
  }

  it("lists configured stack profiles", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createMockContext());

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["list"],
      options: {},
    });

    expect(result).toEqual({
      kind: "profiles.list",
      profiles: ["default", "e2e", "proddata"],
    });
  });

  it("shows the current resolved stack profile", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(
      createMockContext({
        profile: {
          name: "e2e",
          envFiles: [],
          services: ["api"],
          isolate: true,
        },
        state: { selectedProfile: "proddata" },
      }),
    );

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["current"],
      options: { profile: "e2e" },
    });

    expect(result).toEqual({
      kind: "profiles.current",
      profile: "e2e",
      selectedProfile: "proddata",
      overrideProfile: "e2e",
    });
  });

  it("saves selectedProfile for profile use", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createMockContext());
    vi.spyOn(zapper, "loadConfig").mockResolvedValue(undefined);

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["use", "e2e"],
      options: {},
    });

    expect(saveState).toHaveBeenCalledWith("/test", {
      selectedProfile: "e2e",
    });

    expect(result).toEqual({
      kind: "profiles.selected",
      profile: "e2e",
    });
  });

  it("clears selectedProfile for profile reset", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createMockContext());
    vi.spyOn(zapper, "loadConfig").mockResolvedValue(undefined);

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["reset"],
      options: {},
    });

    expect(saveState).toHaveBeenCalledWith("/test", {
      selectedProfile: undefined,
    });

    expect(result).toEqual({
      kind: "profiles.reset",
      profile: "default",
    });
  });

  it("throws when profile use references an unknown profile", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createMockContext());

    await expect(
      new ProfilesCommand().execute({
        zapper,
        service: ["use", "missing"],
        options: {},
      }),
    ).rejects.toThrow(
      "Profile not found: missing. Available profiles: default, e2e, proddata",
    );
  });
});
