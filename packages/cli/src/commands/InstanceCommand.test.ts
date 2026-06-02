import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, saveState } from "../config/stateLoader";
import type { Zapper } from "../core/Zapper";
import type { Context } from "../types/Context";
import { InstanceCommand } from "./InstanceCommand";

function makeContext(projectRoot: string, label?: string): Context {
  return {
    projectName: "test",
    projectRoot,
    environments: [],
    instanceKey: "default",
    instanceId: "abc123",
    instance: {
      key: "default",
      id: "abc123",
      label,
      ports: {},
    },
    processes: [],
    containers: [],
    tasks: [],
    links: [],
    profiles: [],
    state: {
      instances: {
        default: {
          id: "abc123",
          label,
          ports: {},
        },
      },
    },
  };
}

describe("InstanceCommand", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zapper-instance-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prints the selected instance display label when no label is provided", async () => {
    const command = new InstanceCommand();

    const zapper = {
      getContext: () => makeContext(tempDir, "local checkout"),
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: ["label"],
      options: {},
    });

    expect(result).toEqual({
      kind: "instance.label",
      instanceKey: "default",
      instanceId: "abc123",
      label: "local checkout",
      displayLabel: "local checkout",
      updated: false,
    });
  });

  it("falls back to the instance id when no label is set", async () => {
    const command = new InstanceCommand();

    const zapper = {
      getContext: () => makeContext(tempDir),
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: ["label"],
      options: {},
    });

    expect(result).toMatchObject({
      kind: "instance.label",
      instanceId: "abc123",
      displayLabel: "abc123",
      updated: false,
    });
  });

  it("sets the selected instance label when a value is provided", async () => {
    saveState(tempDir, {
      defaultInstance: "default",
      instances: {
        default: {
          id: "abc123",
          ports: {},
        },
      },
    });

    const context = makeContext(tempDir);
    const command = new InstanceCommand();

    const zapper = {
      getContext: () => context,
    };

    const result = await command.execute({
      zapper: zapper as unknown as Zapper,
      service: ["label", "local", "checkout"],
      options: {},
    });

    expect(result).toEqual({
      kind: "instance.label",
      instanceKey: "default",
      instanceId: "abc123",
      label: "local checkout",
      displayLabel: "local checkout",
      updated: true,
    });

    expect(loadState(tempDir).instances?.default.label).toBe("local checkout");
  });
});
