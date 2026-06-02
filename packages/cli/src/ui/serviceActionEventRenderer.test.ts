import { describe, expect, it, vi } from "vitest";
import {
  serviceActionEventToLines,
  serviceActionJsonlReporter,
} from "./serviceActionEventRenderer";

describe("serviceActionEventToLines", () => {
  it("formats service wave events with sorted stop and start lines", () => {
    expect(
      serviceActionEventToLines({
        type: "services.wave",
        stop: ["worker", "api"],
        start: ["web", "db"],
      }),
    ).toEqual(["Stopped api, worker", "Starting db, web"]);
  });

  it("formats healthcheck timeout events", () => {
    expect(
      serviceActionEventToLines({
        type: "service.healthcheck.timeout",
        service: "api",
        healthcheck: "http://localhost:3000/health",
      }),
    ).toEqual(["Healthcheck timeout for api: http://localhost:3000/health"]);
  });

  it("does not render report-only completion events", () => {
    expect(
      serviceActionEventToLines({
        type: "services.wave.completed",
        started: ["api"],
        stopped: ["worker"],
      }),
    ).toEqual([]);
  });

  it("streams events as JSONL", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const event = {
      type: "services.wave" as const,
      start: ["api"],
      stop: [],
    };

    try {
      serviceActionJsonlReporter.onEvent(event);

      expect(logSpy).toHaveBeenCalledWith(JSON.stringify(event));
    } finally {
      logSpy.mockRestore();
    }
  });
});
