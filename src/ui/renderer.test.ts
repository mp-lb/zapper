import { describe, it, expect, vi } from "vitest";
import type { Context } from "../types/Context";
import type { StatusResult } from "../core/getStatus";
import { renderer } from "./renderer";

function createContext(instanceId?: string | null): Context {
  return {
    projectName: "demo",
    projectRoot: "/tmp/demo",
    envFiles: [],
    environments: [],
    gitMethod: "ssh",
    taskDelimiters: ["{{", "}}"],
    instanceId,
    processes: [],
    containers: [],
    tasks: [],
    links: [],
    profiles: [],
    state: {
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createStatusResult(): StatusResult {
  return {
    native: [
      {
        service: "api",
        rawName: "zap.demo.inst123.api",
        status: "up",
        type: "native",
        enabled: true,
      },
    ],
    docker: [],
  };
}

describe("renderer", () => {
  it("builds isolation enabled text", () => {
    const text = renderer.isolation.enabledText("inst123");
    expect(text).toContain("Isolation enabled");
    expect(text).toContain("inst123");
  });

  it("prints isolation enabled through success logging", () => {
    const successSpy = vi
      .spyOn(renderer.log, "success")
      .mockImplementation(() => {});

    renderer.isolation.printEnabled("inst123");

    expect(successSpy).toHaveBeenCalled();
  });

  it("formats instance-aware status header", () => {
    const text = renderer.status.toText(
      createStatusResult(),
      createContext("inst123"),
    );

    expect(renderer.status.contextHeaderText(createContext("inst123"))).toContain(
      "demo",
    );
    expect(text).toContain("demo");
    expect(text).toContain("inst123");
  });
});
