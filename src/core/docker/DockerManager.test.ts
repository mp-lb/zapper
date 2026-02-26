import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DockerManager } from "./DockerManager";
import { runDocker } from "./runDocker";
import { ensureDockerAvailable } from "./ensureDocker";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("./runDocker", () => ({
  runDocker: vi.fn(),
}));

vi.mock("./ensureDocker", () => ({
  ensureDockerAvailable: vi.fn(),
}));

import { spawn } from "child_process";

class MockChildProcess extends EventEmitter {
  pid = 1234;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  unref(): void {}
}

describe("DockerManager.startContainerAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runDocker).mockResolvedValue("");
    vi.mocked(ensureDockerAvailable).mockResolvedValue(undefined);
  });

  it("rejects when docker spawn fails", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new MockChildProcess();
      process.nextTick(() => {
        child.emit("error", new Error("spawn docker ENOENT"));
      });
      return child as never;
    });

    await expect(
      DockerManager.startContainerAsync("zap.test.db", {
        image: "mongo:latest",
      }),
    ).rejects.toThrow("Failed to run Docker command: spawn docker ENOENT");
  });

  it("resolves with child pid when spawned successfully", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new MockChildProcess();
      child.pid = 9876;
      process.nextTick(() => {
        child.emit("spawn");
      });
      return child as never;
    });

    await expect(
      DockerManager.startContainerAsync("zap.test.db", {
        image: "mongo:latest",
      }),
    ).resolves.toBe(9876);
  });
});
