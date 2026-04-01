import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
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
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runDocker).mockResolvedValue("");
    vi.mocked(ensureDockerAvailable).mockResolvedValue(undefined);
    tempDir = fs.mkdtempSync(path.join(tmpdir(), "zapper-docker-test-"));
  });

  it("persists startup output and returns a helpful error when docker run fails", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new MockChildProcess();
      process.nextTick(() => {
        child.stderr.emit(
          "data",
          Buffer.from(
            "docker: Error response from daemon: pull access denied for missing-image.\n",
          ),
        );
        child.emit("close", 125);
      });
      return child as never;
    });

    await expect(
      DockerManager.startContainerAsync(
        "zap.test.db",
        {
          image: "missing-image:latest",
        },
        {
          projectName: "test-project",
          serviceName: "database",
          configDir: tempDir,
        },
      ),
    ).rejects.toThrow(
      "Failed to start Docker service: database (zap.test.db). pull access denied for missing-image.",
    );

    const failureLog = path.join(
      tempDir,
      ".zap",
      "logs",
      "test-project.database.startup.log",
    );
    expect(fs.existsSync(failureLog)).toBe(true);
    const contents = fs.readFileSync(failureLog, "utf8");
    expect(contents).toContain("[stderr]");
    expect(contents).toContain("pull access denied for missing-image");
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
    const failureLog = path.join(
      tempDir,
      ".zap",
      "logs",
      "test-project.database.startup.log",
    );
    fs.mkdirSync(path.dirname(failureLog), { recursive: true });
    fs.writeFileSync(failureLog, "old failure");

    vi.mocked(spawn).mockImplementation(() => {
      const child = new MockChildProcess();
      child.pid = 9876;
      process.nextTick(() => {
        child.stdout.emit("data", Buffer.from("container-id\n"));
        child.emit("close", 0);
      });
      return child as never;
    });

    await expect(
      DockerManager.startContainerAsync(
        "zap.test.db",
        {
          image: "mongo:latest",
        },
        {
          projectName: "test-project",
          serviceName: "database",
          configDir: tempDir,
        },
      ),
    ).resolves.toBe(9876);
    expect(fs.existsSync(failureLog)).toBe(false);
  });
});
