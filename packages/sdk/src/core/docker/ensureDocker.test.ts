import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("../../runtime", async () => {
  const actual =
    await vi.importActual<typeof import("../../runtime")>("../../runtime");

  return {
    ...actual,
    isWsl: vi.fn(() => true),
  };
});

import { spawn } from "child_process";

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function mockCommand(code: number, stdout = "", stderr = ""): MockChildProcess {
  const child = new MockChildProcess();

  process.nextTick(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  });

  return child;
}

describe("ensureDockerAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks both Docker CLI presence and daemon availability", async () => {
    const { ensureDockerAvailable } = await import("./ensureDocker");

    vi.mocked(spawn)
      .mockImplementationOnce(
        () => mockCommand(0, "Docker version 28.0.0") as never,
      )
      .mockImplementationOnce(
        () =>
          mockCommand(1, "", "Cannot connect to the Docker daemon") as never,
      );

    await expect(ensureDockerAvailable()).rejects.toThrow(
      "Docker CLI is installed, but the Docker daemon is not reachable from WSL.",
    );

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["--version"],
      expect.any(Object),
    );

    expect(spawn).toHaveBeenNthCalledWith(
      2,
      "docker",
      ["version"],
      expect.any(Object),
    );
  });
});
