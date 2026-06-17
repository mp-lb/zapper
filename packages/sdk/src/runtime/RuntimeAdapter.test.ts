import { describe, expect, it } from "vitest";
import {
  resolveBashRuntime,
  resolveDockerRuntime,
  resolveOpenUrlRuntime,
} from "./RuntimeAdapter";

describe("runtime adapters", () => {
  it("resolves other external tools through the same adapter boundary", () => {
    expect(resolveDockerRuntime(["ps"], { platform: "linux" })).toEqual({
      command: "docker",
      argsPrefix: ["ps"],
      label: "docker ps",
    });

    expect(resolveBashRuntime(["script.sh"], { platform: "win32" })).toEqual({
      command: "bash",
      argsPrefix: ["script.sh"],
      label: "bash script.sh",
    });

    expect(
      resolveOpenUrlRuntime("https://example.com", { platform: "darwin" }),
    ).toEqual({
      command: "open",
      argsPrefix: ["https://example.com"],
      label: "open https://example.com",
    });
  });
});
