import type { ServiceActionEvent, ServiceActionReporter } from "../types";
import { renderer } from "./renderer";

function sorted(names: string[]): string[] {
  return [...names].sort();
}

export function serviceActionEventToLines(event: ServiceActionEvent): string[] {
  switch (event.type) {
    case "services.wave": {
      const lines: string[] = [];
      const stop = sorted(event.stop);
      const start = sorted(event.start);

      if (stop.length > 0) {
        lines.push(`Stopped ${stop.join(", ")}`);
      }

      if (start.length > 0) {
        lines.push(`Starting ${start.join(", ")}`);
      }

      return lines;
    }

    case "services.wave.completed":
      return [];
    case "service.healthcheck.timeout":
      return [`Healthcheck timeout for ${event.service}: ${event.healthcheck}`];
  }
}

export function renderServiceActionEvent(event: ServiceActionEvent): void {
  const lines = serviceActionEventToLines(event);

  for (const line of lines) {
    if (event.type === "service.healthcheck.timeout") {
      renderer.log.warn(line);
    } else {
      renderer.log.info(line);
    }
  }
}

export const serviceActionEventReporter: ServiceActionReporter = {
  onEvent: renderServiceActionEvent,
};

export const serviceActionJsonlReporter: ServiceActionReporter = {
  onEvent(event: ServiceActionEvent): void {
    renderer.machine.json(event);
  },
};
