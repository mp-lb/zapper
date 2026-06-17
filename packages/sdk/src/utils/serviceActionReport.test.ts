import { describe, expect, it } from "vitest";
import {
  applyServiceActionEventToExecutionReport,
  emptyServiceExecutionReport,
} from "./serviceActionReport";

describe("service action report reducer", () => {
  it("reduces completed wave events into sorted execution reports", () => {
    const report = emptyServiceExecutionReport();

    applyServiceActionEventToExecutionReport(report, {
      type: "services.wave.completed",
      started: ["web", "api"],
      stopped: ["worker"],
    });

    applyServiceActionEventToExecutionReport(report, {
      type: "services.wave.completed",
      started: ["db"],
      stopped: ["cache"],
    });

    expect(report).toEqual({
      started: ["api", "db", "web"],
      stopped: ["cache", "worker"],
      failed: [],
    });
  });

  it("ignores progress-only events", () => {
    const report = emptyServiceExecutionReport();

    applyServiceActionEventToExecutionReport(report, {
      type: "services.wave",
      start: ["api"],
      stop: ["worker"],
    });

    expect(report).toEqual({
      started: [],
      stopped: [],
      failed: [],
    });
  });
});
