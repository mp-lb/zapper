import { ProfilesCommand } from "./ProfilesCommand";
import { Zapper } from "../core/Zapper";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Context } from "../types/Context";
import { saveState } from "../config/stateLoader";
import { select } from "../utils/select";
import { PromptCancelledError } from "../errors";
import { emptyServiceActionReport } from "../utils/serviceActionReport";

vi.mock("../config/stateLoader", async () => ({
  ...(await vi.importActual<typeof import("../config/stateLoader")>(
    "../config/stateLoader",
  )),
  saveState: vi.fn(),
}));

vi.mock("../utils/select", () => ({ select: vi.fn() }));

function profile(name: string, services: string[], isolate = false): Context {
  return {
    projectName: "test",
    projectRoot: "/test",
    configPath: "/test/zap.yaml",
    profiles: ["default", "dev", "e2e"],
    profile: { name, envFiles: [], services, isolate },
    processes: services.map((name) => ({ name, cmd: "node server.js" })),
    containers: [],
    tasks: [],
    environments: [],
    links: [],
    instanceKey: "default",
    state: { selectedProfile: name },
  };
}

function setup(
  before = profile("dev", ["api", "worker"]),
  after = profile("default", ["api"]),
) {
  const zapper = new Zapper();
  let current = before;
  vi.spyOn(zapper, "getContext").mockImplementation(() => current);
  vi.spyOn(zapper, "loadConfig").mockImplementation(async () => {
    current = after;
  });

  const start = vi
    .spyOn(zapper, "startProcesses")
    .mockResolvedValue(emptyServiceActionReport("up"));

  const stop = vi
    .spyOn(zapper, "stopProfileProcesses")
    .mockResolvedValue(emptyServiceActionReport("down"));

  const execute = (service?: string[], options = {}) =>
    new ProfilesCommand().execute({ zapper, service, options });

  return { zapper, start, stop, execute };
}

const ttyDescriptors = [process.stdin, process.stdout].map((stream) =>
  Object.getOwnPropertyDescriptor(stream, "isTTY"),
);

function setTTY(value: boolean) {
  for (const stream of [process.stdin, process.stdout])
    Object.defineProperty(stream, "isTTY", { configurable: true, value });
}

afterEach(() => {
  [process.stdin, process.stdout].forEach((stream, index) => {
    const descriptor = ttyDescriptors[index];
    if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
    else Reflect.deleteProperty(stream, "isTTY");
  });
});

describe("ProfilesCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(["get", "current"])(
    "%s returns the resolved profile",
    async (action) => {
      const { execute } = setup();
      expect(await execute([action])).toMatchObject({
        kind: "profiles.current",
        profile: "dev",
      });

      expect(saveState).not.toHaveBeenCalled();
    },
  );

  it("lists configured profiles", async () => {
    expect(await setup().execute(["list"])).toEqual({
      kind: "profiles.list",
      profiles: ["default", "dev", "e2e"],
    });
  });

  it.each(["set", "use", "reset"])(
    "%s stops excluded services before starting and saving, without a prompt",
    async (action) => {
      const { execute, start, stop } = setup();
      stop.mockImplementation(async () => {
        expect(start).not.toHaveBeenCalled();
        expect(saveState).not.toHaveBeenCalled();
        return emptyServiceActionReport("down");
      });

      start.mockImplementation(async () => {
        expect(saveState).not.toHaveBeenCalled();
        return emptyServiceActionReport("up");
      });

      const result = await execute([action, "default"]);
      expect(stop).toHaveBeenCalledWith("dev", ["worker"], expect.any(Object));
      expect(start).toHaveBeenCalledWith(["api"], expect.any(Object));
      expect(select).not.toHaveBeenCalled();
      expect(saveState).toHaveBeenCalledWith("/test", {
        selectedProfile: action === "reset" ? undefined : "default",
      });

      expect(result).toMatchObject({
        profile: "default",
        hotSwap: { cleanupCandidates: ["worker"], cleanupSkipped: [] },
      });
    },
  );

  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])(
    "stops the previous stack when isolation changes (%s, %s)",
    async (oldIsolate, newIsolate) => {
      const { execute, stop, start } = setup(
        profile("dev", ["api", "worker"], oldIsolate),
        profile("e2e", ["api"], newIsolate),
      );

      await execute(["set", "e2e"]);
      expect(stop).toHaveBeenCalledWith(
        "dev",
        ["api", "worker"],
        expect.any(Object),
      );

      expect(start).toHaveBeenCalledWith(["api"], expect.any(Object));
    },
  );

  it.each(["env", "definition"])(
    "restarts shared services when their %s changes",
    async (change) => {
      const before = profile("dev", ["api"]);
      const after = profile("default", ["api"]);
      if (change === "env")
        after.processes[0].resolvedEnv = { API_URL: "https://example.test" };
      else after.processes[0].cmd = "node other.js";
      const { execute, stop } = setup(before, after);
      await execute(["set", "default"]);
      expect(stop).toHaveBeenCalledWith("dev", ["api"], expect.any(Object));
    },
  );

  it.each(["native", "docker"])(
    "only replaces affected %s services in a mixed transition",
    async (kind) => {
      const before = profile("dev", ["changed", "unchanged", "removed"]);
      const after = profile("default", ["changed", "unchanged", "added"]);
      before.envFiles = ["/test/.env.dev"];
      after.envFiles = ["/test/.env.prod"];
      before.profile!.envFiles = before.envFiles;
      after.profile!.envFiles = after.envFiles;
      before.processes[0].resolvedEnv = { MODE: "dev" };
      after.processes[0].resolvedEnv = { MODE: "prod" };
      before.processes[1].resolvedEnv = { PORT: "3000", MODE: "fixed" };
      after.processes[1].resolvedEnv = { MODE: "fixed", PORT: "3000" };

      if (kind === "docker") {
        for (const context of [before, after]) {
          context.containers = context.processes.map(
            ({ name, resolvedEnv }) => ({
              name,
              image: "alpine",
              resolvedEnv,
            }),
          );

          context.processes = [];
        }
      }

      const { execute, stop, start } = setup(before, after);
      await execute(["set", "default"]);
      expect(stop).toHaveBeenCalledExactlyOnceWith(
        "dev",
        ["changed", "removed"],
        expect.any(Object),
      );

      expect(start).toHaveBeenCalledExactlyOnceWith(
        ["added", "changed", "unchanged"],
        expect.any(Object),
      );

      expect(stop.mock.invocationCallOrder[0]).toBeLessThan(
        start.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([
    [{}, { MODE: "dev" }],
    [{ MODE: "dev" }, {}],
  ])(
    "replaces services when env keys are added or removed",
    async (oldEnv, newEnv) => {
      const before = profile("dev", ["api"]);
      const after = profile("default", ["api"]);
      before.processes[0].resolvedEnv = oldEnv;
      after.processes[0].resolvedEnv = newEnv;
      const { execute, stop } = setup(before, after);
      await execute(["set", "default"]);
      expect(stop).toHaveBeenCalledWith("dev", ["api"], expect.any(Object));
    },
  );

  it("keeps services with identical environments despite different env files", async () => {
    const before = profile("dev", ["api"]);
    const after = profile("default", ["api"]);
    after.envFiles = ["/test/.env.prod"];
    after.profile!.envFiles = after.envFiles;
    before.processes[0].resolvedEnv = { MODE: "same" };
    after.processes[0].resolvedEnv = { MODE: "same" };
    const { execute, stop } = setup(before, after);
    await execute(["set", "default"]);
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops all previous services for an empty target profile", async () => {
    const { execute, stop, start } = setup(
      profile("dev", ["api"]),
      profile("default", []),
    );

    await execute(["set", "default"]);
    expect(stop).toHaveBeenCalledWith("dev", ["api"], expect.any(Object));
    expect(start).not.toHaveBeenCalled();
  });

  it("ensures services are running even when setting the current profile", async () => {
    const { execute, start, stop } = setup(
      profile("dev", ["api"]),
      profile("dev", ["api"]),
    );

    await execute(["set", "dev"]);
    expect(start).toHaveBeenCalledWith(["api"], expect.any(Object));
    expect(stop).not.toHaveBeenCalled();
  });

  it.each(["stop", "start"])(
    "does not save or report success when %s fails",
    async (phase) => {
      const { execute, start, stop } = setup();
      (phase === "stop" ? stop : start).mockRejectedValue(
        new Error("Service failed"),
      );

      await expect(execute(["set", "default"])).rejects.toThrow(
        "Service failed",
      );

      expect(saveState).not.toHaveBeenCalled();
      if (phase === "stop") expect(start).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown profile before changing services or state", async () => {
    const { execute, start, stop, zapper } = setup();
    await expect(execute(["set", "missing"])).rejects.toThrow(
      "Profile not found: missing",
    );

    expect(zapper.loadConfig).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });

  it("requires a terminal for the picker", async () => {
    setTTY(false);
    await expect(setup().execute(["select"])).rejects.toThrow(
      "zap profile get or zap profile set <name>",
    );
  });

  it("preselects and marks the active profile, then applies the chosen profile", async () => {
    setTTY(true);
    vi.mocked(select).mockResolvedValue("default");
    const { execute, stop } = setup();
    await execute(["select"]);
    expect(select).toHaveBeenCalledWith(
      "Select profile",
      [
        { label: "default", value: "default" },
        { label: "dev ✓ active", value: "dev" },
        { label: "e2e", value: "e2e" },
      ],
      expect.objectContaining({ initial: 1 }),
    );

    expect(stop).toHaveBeenCalledWith("dev", ["worker"], expect.any(Object));
  });

  it("cancels the picker without changing services or state", async () => {
    setTTY(true);
    vi.mocked(select).mockRejectedValue(new PromptCancelledError());
    const { execute, stop, start } = setup();
    await expect(execute(["select"])).rejects.toBeInstanceOf(
      PromptCancelledError,
    );

    expect(stop).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });
});
