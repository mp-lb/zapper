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
  it("builds instance ready text", () => {
    const text = renderer.isolation.enabledText("inst123");
    expect(text).toContain("Instance ready");
    expect(text).toContain("inst123");
  });

  it("prints instance ready through success logging", () => {
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

    expect(
      renderer.status.contextHeaderText(createContext("inst123")),
    ).toContain("demo");
    expect(text).toContain("demo");
    expect(text).toContain("inst123");
  });

  it("builds confirmation prompts through renderer", () => {
    expect(renderer.confirm.resetPromptText()).toContain(".zap");
    expect(renderer.confirm.promptText("Continue?", false)).toBe(
      "Continue? [y/N] ",
    );
    expect(renderer.confirm.promptText("Line 1\nContinue?", false)).toBe(
      "Line 1\nContinue?\n[y/N] ",
    );
    expect(
      renderer.confirm.globalKillAllPromptText({
        projectCount: 2,
        projectNames: ["alpha", "beta"],
        pm2Count: 4,
        containerCount: 1,
      }),
    ).toContain("\n  - alpha\n  - beta\n");
    expect(renderer.confirm.deleteResourcesPromptText()).toBe(
      "Delete these resources?",
    );
  });

  it("formats links with homepage labeling", () => {
    const text = renderer.links.toText([
      {
        name: "Home",
        url: "http://localhost:3000",
        isHomepage: true,
      },
      {
        name: "API Docs",
        url: "http://localhost:3001/docs",
        isHomepage: false,
      },
    ]);

    expect(text).toContain("Home");
    expect(text).toContain("homepage");
    expect(text).toContain("http://localhost:3001/docs");
  });
});
