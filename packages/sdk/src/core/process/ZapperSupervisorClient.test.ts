import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZapperSupervisorClient } from "./ZapperSupervisorClient";

const mocks = vi.hoisted(() => ({
  running: false,
  spawn: vi.fn(),
  unref: vi.fn(),
}));

vi.mock("child_process", () => ({ spawn: mocks.spawn }));
vi.mock("fs", () => ({
  closeSync: vi.fn(),
  existsSync: () => false,
  mkdirSync: vi.fn(),
  openSync: () => 42,
  rmSync: vi.fn(),
}));

vi.mock("net", () => ({
  default: {
    createConnection: () => {
      const socket = Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        setTimeout: vi.fn(),
        write: (payload: string) => {
          const request = JSON.parse(payload);
          socket.emit(
            "data",
            JSON.stringify({
              id: request.id,
              ok: true,
              result: request.method === "ping" ? "pong" : [],
            }),
          );

          socket.emit("end");
        },
      });

      queueMicrotask(() => {
        socket.emit(mocks.running ? "connect" : "error");
      });

      return socket;
    },
  },
}));

describe("ZapperSupervisorClient startup", () => {
  beforeEach(() => {
    mocks.running = false;
    mocks.spawn.mockImplementation(() => {
      mocks.running = true;
      return { unref: mocks.unref };
    });

    vi.stubEnv("ELECTRON_RUN_AS_NODE", undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts the Electron host executable in Node mode without changing the host environment", async () => {
    vi.spyOn(process, "versions", "get").mockReturnValue({
      ...process.versions,
      electron: "35.0.0",
    });

    await expect(ZapperSupervisorClient.list()).resolves.toEqual([]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("ZapperSupervisorDaemon.js")],
      expect.objectContaining({
        detached: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      }),
    );

    expect(process.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(mocks.unref).toHaveBeenCalledOnce();
  });

  it("keeps the Node CLI environment unchanged", async () => {
    await expect(ZapperSupervisorClient.list()).resolves.toEqual([]);

    expect(mocks.spawn.mock.calls[0][2].env).toBe(process.env);
    expect(
      mocks.spawn.mock.calls[0][2].env.ELECTRON_RUN_AS_NODE,
    ).toBeUndefined();
  });

  it("reuses an existing supervisor", async () => {
    mocks.running = true;

    await expect(ZapperSupervisorClient.list()).resolves.toEqual([]);

    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
