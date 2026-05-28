import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCommandRunEvent, captureCommandRun } from "./index";

describe("analytics", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ZAPPER_ANALYTICS_ID = "test-analytics-id";
    delete process.env.POSTHOG_KEY;
    delete process.env.ZAPPER_ANALYTICS_DISABLED;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.ZAPPER_ANALYTICS_ID;
  });

  it("builds space-separated command breakdown fields", () => {
    const event = buildCommandRunEvent({
      command: "profile",
      service: ["use", "local"],
      options: {},
    });

    expect(event?.eventType).toBe("command.run");
    expect(event?.source?.platform).toBe("cli");
    expect(event?.details).toMatchObject({
      origin: "cli",
      command: "profile use",
      commandPath: ["profile", "use"],
      command_l1: "profile",
      command_l2: "profile use",
      handler: "profile",
      targetCount: 2,
    });
  });

  it("normalizes git handlers into command path fields", () => {
    const event = buildCommandRunEvent({
      command: "git:status",
      service: undefined,
      options: { json: true },
    });

    expect(event?.details).toMatchObject({
      command: "git status",
      command_l1: "git",
      command_l2: "git status",
      handler: "git:status",
      json: true,
    });
  });

  it("does not throw when capture is disabled during tests", () => {
    process.env.POSTHOG_KEY = "phc_test";

    expect(() =>
      captureCommandRun({
        command: "up",
        service: undefined,
        options: {},
      }),
    ).not.toThrow();
  });

  it("does not throw without PostHog config", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      captureCommandRun({
        command: "up",
        service: undefined,
        options: {},
      }),
    ).not.toThrow();
  });
});
