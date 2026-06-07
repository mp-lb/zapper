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

  it("uses the CLI package PM2 on Unix when app runtime env is not configured", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "linux",
      env: {},
      nodePath: "/usr/local/bin/node",
      packageResolve: (id) => {
        expect(id).toBe("pm2/bin/pm2");
        return "/usr/local/lib/node_modules/@mp-lb/zapper/node_modules/pm2/bin/pm2";
      },
    });

    expect(runtime).toEqual({
      command: "/usr/local/bin/node",
      argsPrefix: [
        "/usr/local/lib/node_modules/@mp-lb/zapper/node_modules/pm2/bin/pm2",
        "list",
      ],
      label:
        "/usr/local/bin/node /usr/local/lib/node_modules/@mp-lb/zapper/node_modules/pm2/bin/pm2 list",
    });
  });

  it("falls back to pm2 on Unix when package PM2 cannot be resolved", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "linux",
      env: {},
      packageResolve: () => {
        throw new Error("missing pm2");
      },
    });

    expect(runtime).toEqual({
      command: "pm2",
      argsPrefix: ["list"],
      label: "pm2 list",
    });
  });

  it("falls back to pm2.cmd on native Windows when package PM2 cannot be resolved", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "win32",
      env: {},
      packageResolve: () => {
        throw new Error("missing pm2");
      },
    });

    expect(runtime).toEqual({
      command: "pm2.cmd",
      argsPrefix: ["list"],
      label: "pm2.cmd list",
    });
  });

  it("can opt into the global PM2 executable", () => {
    const runtime = resolvePm2Runtime(["list"], {
      platform: "linux",
      env: {
        ZAPPER_PM2_USE_GLOBAL: "1",
      },
      packageResolve: () => "/ignored/pm2/bin/pm2",
    });

    expect(runtime).toEqual({
      command: "pm2",
      argsPrefix: ["list"],
      label: "pm2 list",
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
      execFileSync:
        execFileSync as unknown as typeof import("child_process").execFileSync,
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
