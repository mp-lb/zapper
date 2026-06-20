import { describe, it, expect, vi } from "vitest";
import type { Context } from "../types/Context";
import type { ServiceListResult } from "../core/getServiceList";
import type { StatusResult } from "../core/getStatus";
import { renderer } from "./renderer";

function createContext(
  instanceId?: string | null,
  label?: string,
  options: {
    instanceKey?: string;
    profileName?: string;
    stackCount?: number;
  } = {},
): Context {
  const instanceKey = options.instanceKey ?? "default";

  const stacks =
    options.stackCount && instanceId
      ? Object.fromEntries(
          Array.from({ length: options.stackCount }, (_, index) => {
            const profile =
              index === 0 ? options.profileName || "default" : `p${index}`;

            return [
              profile,
              {
                stackId: index === 0 ? instanceId : `id${index}`,
                profile,
              },
            ];
          }),
        )
      : undefined;

  return {
    projectName: "demo",
    projectRoot: "/tmp/demo",
    envFiles: [],
    environments: [],
    gitMethod: "ssh",
    taskDelimiters: ["{{", "}}"],
    instanceKey,
    instanceId,
    instance: instanceId
      ? {
          key: instanceKey,
          id: instanceId,
          label,
          ports: {},
        }
      : undefined,
    processes: [],
    containers: [],
    tasks: [],
    links: [],
    profiles: [],
    profile: options.profileName
      ? {
          name: options.profileName,
          envFiles: [],
          services: "*",
          isolate: false,
        }
      : undefined,
    state: {
      lastUpdated: "2026-01-01T00:00:00.000Z",
      stacks,
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

  it("suppresses human renderer output in JSON mode", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderer.output.setJsonMode(true);

      renderer.log.info("info");
      renderer.log.warn("warning");
      renderer.log.error("error");
      renderer.log.success("success");
      renderer.log.report("report");
      renderer.machine.json({ ok: true });

      expect(renderer.output.isJsonMode()).toBe(true);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('{"ok":true}');
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      renderer.output.setJsonMode(false);
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("hides the default stack id in the status header", () => {
    const text = renderer.status.toText(
      createStatusResult(),
      createContext("inst123"),
    );

    expect(
      renderer.status.contextHeaderText(createContext("inst123")),
    ).toContain("demo");

    expect(text).toContain("demo");
    expect(text).not.toContain("inst123");
  });

  it("formats explicit instance status header with label and id", () => {
    const text = renderer.status.toText(
      createStatusResult(),
      createContext("inst123", "local checkout", { instanceKey: "local" }),
    );

    expect(text).toContain("local checkout");
    expect(text).toContain("inst123");
  });

  it("formats profile status header without stack id for a single stack", () => {
    const text = renderer.status.toText(
      createStatusResult(),
      createContext("inst123", undefined, {
        profileName: "e2e",
        stackCount: 1,
      }),
    );

    expect(text).toContain("demo [e2e]");
    expect(text).not.toContain("inst123");
  });

  it("formats profile status header with stack id when multiple stacks exist", () => {
    const text = renderer.status.toText(
      createStatusResult(),
      createContext("inst123", undefined, {
        profileName: "e2e",
        stackCount: 2,
      }),
    );

    expect(text).toContain("demo [e2e - inst123 - 2 stacks]");
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
        nativeProcessCount: 4,
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

  it("formats ls ports in a separate table", () => {
    const listResult: ServiceListResult = {
      services: [
        {
          type: "native",
          service: "api",
          status: "up",
          enabled: true,
          ports: ["API_PORT=3001"],
          volumes: [],
          cwd: "./apps/api",
          cmd: "pnpm dev",
        },
      ],
      ports: [{ name: "API_PORT", value: "3001" }],
    };

    const text = renderer.list.toText(listResult, createContext("inst123"));

    expect(text).toContain("Services");
    expect(text).toContain("Ports");
    expect(text).toContain("API_PORT");
    expect(text).toContain("3001");
    expect(text).not.toContain("PORTS");
  });
});
