import { describe, expect, it, vi } from "vitest";
import { Zapper } from "../core/Zapper";
import { Context } from "../types/index";
import { StackCommand } from "./StackCommand";

describe("StackCommand", () => {
  function createContext(overrides: Partial<Context> = {}): Context {
    return {
      projectName: "test",
      projectRoot: "/test",
      profiles: ["default", "e2e"],
      profile: {
        name: "e2e",
        envFiles: [],
        services: "*",
        isolate: true,
      },
      processes: [],
      containers: [],
      tasks: [],
      environments: [],
      links: [],
      instanceKey: "e2e",
      instanceId: "def456",
      state: {
        selectedProfile: "e2e",
        stacks: {
          default: {
            stackId: "abc123",
            profile: "default",
          },
          e2e: {
            stackId: "def456",
            profile: "e2e",
          },
        },
      },
      ...overrides,
    };
  }

  it("prints current stack id", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createContext());

    const result = await new StackCommand().execute({
      zapper,
      service: ["id"],
      options: {},
    });

    expect(result).toEqual({
      kind: "stack.id",
      stackId: "def456",
      profile: "e2e",
    });
  });

  it("prints current stack details", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createContext());

    const result = await new StackCommand().execute({
      zapper,
      service: ["current"],
      options: {},
    });

    expect(result).toEqual({
      kind: "stack.current",
      stack: {
        profile: "e2e",
        stackId: "def456",
        current: true,
      },
    });
  });

  it("lists known stacks from state", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(createContext());

    const result = await new StackCommand().execute({
      zapper,
      service: ["list"],
      options: {},
    });

    expect(result).toEqual({
      kind: "stack.list",
      stacks: [
        {
          profile: "default",
          stackId: "abc123",
          current: false,
        },
        {
          profile: "e2e",
          stackId: "def456",
          current: true,
        },
      ],
    });
  });

  it("requires initialized state for current stack id", async () => {
    const zapper = new Zapper();
    vi.spyOn(zapper, "getContext").mockReturnValue(
      createContext({ instanceId: undefined }),
    );

    await expect(
      new StackCommand().execute({
        zapper,
        service: ["id"],
        options: {},
      }),
    ).rejects.toThrow("Current stack is not initialized");
  });
});
