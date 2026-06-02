import { describe, expect, it, vi } from "vitest";
import {
  resolveBashRuntime,
  resolveDockerRuntime,
  resolveOpenUrlRuntime,
  resolvePm2Runtime,
} from "./RuntimeAdapter";

describe("runtime adapters", () => {
  it("uses bundled PM2 when ZAPPER_NODE and ZAPPER_PM2_JS are set", () => {
    const runtime = resolvePm2Runtime(["jlist"], {
      platform: "darwin",
      env: {
        ZAPPER_NODE: "/Applications/Zapper/node",
        ZAPPER_PM2_JS: "/Applications/Zapper/pm2/bin/pm2",
      },
    });

    expect(runtime).toEqual({
      command: "/Applications/Zapper/node",
      argsPrefix: ["/Applications/Zapper/pm2/bin/pm2", "jlist"],
      label: "/Applications/Zapper/node /Applications/Zapper/pm2/bin/pm2 jlist",
    });
  });

  it("falls back to pm2 on Unix when bundled PM2 is not configured", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "linux",
      env: {},
    });

    expect(runtime).toEqual({
      command: "pm2",
      argsPrefix: ["list"],
      label: "pm2 list",
    });
  });

  it("falls back to pm2.cmd on native Windows", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "win32",
      env: {},
    });

    expect(runtime).toEqual({
      command: "pm2.cmd",
      argsPrefix: ["list"],
      label: "pm2.cmd list",
    });
  });

  it("converts Windows-looking bundled paths when running under WSL", () => {
    const execFileSync = vi.fn((command: string, args: string[]) => {
      if (command !== "wslpath") throw new Error("unexpected command");
      return args[1].includes("node.exe")
        ? "/mnt/c/Program Files/nodejs/node.exe\n"
        : "/mnt/c/Users/me/AppData/Roaming/npm/node_modules/pm2/bin/pm2\n";
    });

    const runtime = resolvePm2Runtime(["jlist"], {
      platform: "linux",
      env: {
        WSL_DISTRO_NAME: "Ubuntu",
        ZAPPER_NODE: "C:\\Program Files\\nodejs\\node.exe",
        ZAPPER_PM2_JS:
          "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\pm2\\bin\\pm2",
      },
      execFileSync,
    });

    expect(runtime.command).toBe("/mnt/c/Program Files/nodejs/node.exe");
    expect(runtime.argsPrefix).toEqual([
      "/mnt/c/Users/me/AppData/Roaming/npm/node_modules/pm2/bin/pm2",
      "jlist",
    ]);
  });

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
