import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCommandResult } from "./commandResultRenderer";
import { renderer } from "./renderer";

describe("renderCommandResult", () => {
  afterEach(() => {
    renderer.output.setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("prints a JSONL command completion line for service actions", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderCommandResult(
      {
        kind: "services.action",
        action: "up",
        services: ["api"],
        report: {
          status: "success",
          action: "up",
          services: ["api"],
          started: ["api"],
          stopped: [],
          failed: [],
        },
      },
      { json: false, jsonl: true },
    );

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        type: "command.completed",
        status: "success",
        action: "up",
        report: {
          status: "success",
          action: "up",
          services: ["api"],
          started: ["api"],
          stopped: [],
          failed: [],
        },
      }),
    );
  });

  it("prints simple action reports as JSON", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderCommandResult(
      {
        kind: "launch.opened",
        url: "http://localhost:3000",
        report: {
          status: "success",
          action: "launch",
          opened: {
            status: "success",
            url: "http://localhost:3000",
          },
        },
      },
      { json: true },
    );

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        status: "success",
        action: "launch",
        opened: {
          status: "success",
          url: "http://localhost:3000",
        },
      }),
    );
  });

  it("prints remaining action commands as reports", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderCommandResult(
      {
        kind: "git.pull.completed",
      },
      { json: true },
    );

    renderCommandResult(
      {
        kind: "profiles.selected",
        profile: "dev",
      },
      { json: true },
    );

    renderCommandResult(
      {
        kind: "volume.prune",
        status: "completed",
        instanceKey: "default",
        volumes: {},
      },
      { json: true },
    );

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ status: "success", action: "git.pull" }),
    );

    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        status: "success",
        action: "profile.use",
        profile: "dev",
      }),
    );

    expect(logSpy).toHaveBeenNthCalledWith(
      3,
      JSON.stringify({
        status: "completed",
        action: "volume.prune",
        instanceKey: "default",
        volumes: {},
      }),
    );
  });

  it("prints only volume names for id-only volume lists", () => {
    const reportSpy = vi
      .spyOn(renderer.log, "report")
      .mockImplementation(() => {});

    renderCommandResult(
      {
        kind: "volume.list",
        instanceKey: "default",
        service: "postgres",
        managedOnly: true,
        idOnly: true,
        volumes: [
          {
            name: "zap.myproject.abc123.vol1",
            internalDir: "/var/lib/postgresql/data",
            managed: true,
          },
        ],
      },
      { json: false },
    );

    expect(reportSpy).toHaveBeenCalledWith("zap.myproject.abc123.vol1");
  });
});
