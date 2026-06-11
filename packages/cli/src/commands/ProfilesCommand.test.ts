import { ProfilesCommand } from "./ProfilesCommand";
import { Zapper } from "../core/Zapper";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { Context } from "../types/index";
import { saveState } from "../config/stateLoader";
import { confirm } from "../utils/confirm";

vi.mock("../config/stateLoader", async () => {
  const actual = await vi.importActual<typeof import("../config/stateLoader")>(
    "../config/stateLoader",
  );

  return {
    ...actual,
    saveState: vi.fn(),
  };
});

vi.mock("../utils/confirm", () => ({
  confirm: vi.fn(),
}));

describe("ProfilesCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      previousProfile: "default",
      hotSwap: undefined,
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
      previousProfile: "default",
      hotSwap: undefined,
    });
  });

  it("starts newly selected non-isolated profile services", async () => {
    const zapper = new Zapper();

    const before = createMockContext({
      profiles: ["default", "dev"],
      processes: [{ name: "api", command: "pnpm dev" }],
      profile: {
        name: "default",
        envFiles: [],
        services: ["api"],
        isolate: false,
      },
    });

    const after = createMockContext({
      profiles: ["default", "dev"],
      processes: [
        { name: "api", command: "pnpm dev" },
        { name: "worker", command: "pnpm worker" },
      ],
      profile: {
        name: "dev",
        envFiles: [],
        services: ["api", "worker"],
        isolate: false,
      },
    });

    vi.spyOn(zapper, "getContext")
      .mockReturnValueOnce(before)
      .mockReturnValue(after);

    vi.spyOn(zapper, "loadConfig").mockResolvedValue(undefined);
    vi.spyOn(zapper, "startProcesses").mockResolvedValue({
      status: "success",
      action: "up",
      services: ["api", "worker"],
      started: ["worker"],
      stopped: [],
      failed: [],
    });

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["use", "dev"],
      options: {},
    });

    expect(zapper.startProcesses).toHaveBeenCalledWith(
      ["api", "worker"],
      expect.any(Object),
    );

    expect(result).toEqual({
      kind: "profiles.selected",
      profile: "dev",
      previousProfile: "default",
      hotSwap: {
        started: {
          status: "success",
          action: "up",
          services: ["api", "worker"],
          started: ["worker"],
          stopped: [],
          failed: [],
        },
        stopped: undefined,
        cleanupCandidates: [],
        cleanupSkipped: [],
      },
    });
  });

  it("prompts before stopping services no longer needed by a profile", async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    const zapper = new Zapper();

    const before = createMockContext({
      profiles: ["default", "dev"],
      processes: [
        { name: "api", command: "pnpm dev" },
        { name: "worker", command: "pnpm worker" },
      ],
      profile: {
        name: "dev",
        envFiles: [],
        services: ["api", "worker"],
        isolate: false,
      },
    });

    const after = createMockContext({
      profiles: ["default", "dev"],
      processes: [{ name: "api", command: "pnpm dev" }],
      profile: {
        name: "default",
        envFiles: [],
        services: ["api"],
        isolate: false,
      },
    });

    vi.spyOn(zapper, "getContext")
      .mockReturnValueOnce(before)
      .mockReturnValue(after);

    vi.spyOn(zapper, "loadConfig").mockResolvedValue(undefined);
    vi.spyOn(zapper, "startProcesses").mockResolvedValue({
      status: "success",
      action: "up",
      services: ["api"],
      started: [],
      stopped: [],
      failed: [],
    });

    vi.spyOn(zapper, "stopProfileProcesses").mockResolvedValue({
      status: "success",
      action: "down",
      services: ["worker"],
      started: [],
      stopped: ["worker"],
      failed: [],
    });

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["use", "default"],
      options: {},
    });

    expect(confirm).toHaveBeenCalledWith(
      "Shut down services no longer needed by default: worker?",
      { defaultYes: true },
    );

    expect(zapper.stopProfileProcesses).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "profiles.selected",
      profile: "default",
      previousProfile: "dev",
      hotSwap: {
        cleanupCandidates: ["worker"],
        cleanupSkipped: ["worker"],
      },
    });
  });

  it("force-stops services no longer needed by a profile without prompting", async () => {
    const zapper = new Zapper();

    const before = createMockContext({
      profiles: ["default", "dev"],
      processes: [
        { name: "api", command: "pnpm dev" },
        { name: "worker", command: "pnpm worker" },
      ],
      profile: {
        name: "dev",
        envFiles: [],
        services: ["api", "worker"],
        isolate: false,
      },
    });

    const after = createMockContext({
      profiles: ["default", "dev"],
      processes: [{ name: "api", command: "pnpm dev" }],
      profile: {
        name: "default",
        envFiles: [],
        services: ["api"],
        isolate: false,
      },
    });

    vi.spyOn(zapper, "getContext")
      .mockReturnValueOnce(before)
      .mockReturnValue(after);

    vi.spyOn(zapper, "loadConfig").mockResolvedValue(undefined);
    vi.spyOn(zapper, "startProcesses").mockResolvedValue({
      status: "success",
      action: "up",
      services: ["api"],
      started: [],
      stopped: [],
      failed: [],
    });

    vi.spyOn(zapper, "stopProfileProcesses").mockResolvedValue({
      status: "success",
      action: "down",
      services: ["worker"],
      started: [],
      stopped: ["worker"],
      failed: [],
    });

    const result = await new ProfilesCommand().execute({
      zapper,
      service: ["use", "default"],
      options: { force: true },
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(zapper.stopProfileProcesses).toHaveBeenCalledWith(
      "dev",
      ["worker"],
      expect.any(Object),
    );

    expect(result).toMatchObject({
      kind: "profiles.selected",
      profile: "default",
      previousProfile: "dev",
      hotSwap: {
        stopped: {
          stopped: ["worker"],
        },
        cleanupCandidates: ["worker"],
        cleanupSkipped: [],
      },
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
