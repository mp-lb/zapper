import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useZapperProject } from "./useZapperProject";
import type {
  ZapperProjectActionResult,
  ZapperProjectClient,
  ZapperProjectSnapshot,
} from "./types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function snapshot(
  overrides: Partial<ZapperProjectSnapshot> = {},
): ZapperProjectSnapshot {
  return {
    projectName: "demo",
    projectRoot: "/repo/demo",
    homepage: "http://localhost:3000",
    links: [{ name: "Home", url: "http://localhost:3000", isHomepage: true }],
    status: {
      native: [
        {
          service: "web",
          rawName: "zap.demo.web",
          status: "up",
          type: "native",
          enabled: true,
        },
      ],
      docker: [],
    },
    counts: {
      total: 1,
      up: 1,
      pending: 0,
      down: 0,
      native: 1,
      docker: 0,
    },
    profiles: {
      configured: ["default", "e2e"],
      current: "default",
      selected: undefined,
      override: undefined,
    },
    refreshedAt: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}

function actionResult(
  action: ZapperProjectActionResult["action"],
  nextSnapshot: ZapperProjectSnapshot,
): ZapperProjectActionResult {
  return {
    action,
    snapshot: nextSnapshot,
  };
}

function createClient(
  overrides: Partial<ZapperProjectClient> = {},
): ZapperProjectClient {
  const initial = snapshot();

  return {
    getProject: vi.fn(async () => initial),
    up: vi.fn(async () => actionResult("up", initial)),
    down: vi.fn(async () => actionResult("down", initial)),
    restart: vi.fn(async () => actionResult("restart", initial)),
    selectProfile: vi.fn(async (_query, profile) =>
      actionResult(
        "profile.select",
        snapshot({
          profiles: {
            configured: ["default", "e2e"],
            current: profile,
            selected: profile,
          },
        }),
      ),
    ),
    resetProfile: vi.fn(async () =>
      actionResult(
        "profile.reset",
        snapshot({
          profiles: {
            configured: ["default", "e2e"],
            current: "default",
          },
        }),
      ),
    ),
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("useZapperProject", () => {
  it("loads project status, counts, links, and profiles", async () => {
    const client = createClient();

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.error).toBeUndefined();
    expect(result.current.counts?.up).toBe(1);
    expect(result.current.links).toHaveLength(1);
    expect(result.current.homepage).toBe("http://localhost:3000");
    expect(result.current.profiles).toEqual(["default", "e2e"]);
    expect(client.getProject).toHaveBeenCalledWith({
      dir: "/repo/demo",
      profile: undefined,
    });
  });

  it("surfaces failed reads", async () => {
    const client = createClient({
      getProject: vi.fn(async () => {
        throw new Error("cannot read project");
      }),
    });

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() =>
      expect(result.current.error?.message).toBe("cannot read project"),
    );

    expect(result.current.loading).toBe(false);
  });

  it("refreshes after actions and exposes settling state", async () => {
    const next = snapshot({
      status: {
        native: [
          {
            service: "web",
            rawName: "zap.demo.web",
            status: "down",
            type: "native",
            enabled: true,
          },
        ],
        docker: [],
      },
      counts: {
        total: 1,
        up: 0,
        pending: 0,
        down: 1,
        native: 1,
        docker: 0,
      },
    });

    const action = deferred<ZapperProjectActionResult>();

    const client = createClient({
      down: vi.fn(() => action.promise),
    });

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    let downPromise!: Promise<ZapperProjectActionResult>;
    act(() => {
      downPromise = result.current.down();
    });

    expect(result.current.pendingAction).toBe("down");
    expect(result.current.settling).toBe(true);

    await act(async () => {
      action.resolve(actionResult("down", next));
      await downPromise;
    });

    expect(result.current.pendingAction).toBeUndefined();
    expect(result.current.counts?.down).toBe(1);
  });

  it("updates profile state after selecting and resetting a profile", async () => {
    const client = createClient();

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(async () => {
      await result.current.setProfile("e2e");
    });

    expect(result.current.profile).toBe("e2e");
    expect(result.current.selectedProfile).toBe("e2e");
    expect(client.selectProfile).toHaveBeenCalledWith(
      { dir: "/repo/demo", profile: undefined },
      "e2e",
    );

    await act(async () => {
      await result.current.resetProfile();
    });

    expect(result.current.profile).toBe("default");
    expect(result.current.selectedProfile).toBeUndefined();
  });

  it("does not let stale failed reads overwrite newer success", async () => {
    const slowFailure = deferred<ZapperProjectSnapshot>();
    const fastSuccess = snapshot({ projectName: "fresh" });

    const client = createClient({
      getProject: vi
        .fn()
        .mockReturnValueOnce(slowFailure.promise)
        .mockResolvedValueOnce(fastSuccess),
    });

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() => expect(client.getProject).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      slowFailure.reject(new Error("old failure"));
      await slowFailure.promise.catch(() => undefined);
    });

    expect(result.current.data?.projectName).toBe("fresh");
    expect(result.current.error).toBeUndefined();
  });

  it("clears a failed read on the next successful refresh", async () => {
    const client = createClient({
      getProject: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockResolvedValueOnce(snapshot({ projectName: "recovered" })),
    });

    const { result } = renderHook(() =>
      useZapperProject({ dir: "/repo/demo", client }),
    );

    await waitFor(() =>
      expect(result.current.error?.message).toBe("temporary failure"),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data?.projectName).toBe("recovered");
    expect(result.current.error).toBeUndefined();
  });
});
