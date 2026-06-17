import type {
  ServiceActionEvent,
  ServiceActionName,
  ServiceActionReport,
  ServiceExecutionReport,
} from "../types";

export function emptyServiceExecutionReport(): ServiceExecutionReport {
  return {
    started: [],
    stopped: [],
    failed: [],
  };
}

export function applyServiceActionEventToExecutionReport(
  report: ServiceExecutionReport,
  event: ServiceActionEvent,
): void {
  if (event.type !== "services.wave.completed") return;

  report.started.push(...event.started);
  report.stopped.push(...event.stopped);
  report.started.sort();
  report.stopped.sort();
}

export function emptyServiceActionReport(
  action: ServiceActionName,
  services?: string[],
): ServiceActionReport {
  return {
    status: "success",
    action,
    services,
    ...emptyServiceExecutionReport(),
  };
}
