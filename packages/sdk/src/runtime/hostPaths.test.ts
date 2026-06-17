import { describe, expect, it, vi } from "vitest";
import { isWsl, normalizeHostPath, resolveHostPath } from "./hostPaths";

describe("host path helpers", () => {
  it("detects WSL from environment", () => {
    expect(
      isWsl({
        platform: "linux",
        env: { WSL_DISTRO_NAME: "Ubuntu" },
      }),
    ).toBe(true);
  });

  it("converts Windows absolute paths under WSL", () => {
    const execFileSync = vi.fn(() => "/mnt/c/Users/me/project\n");

    expect(
      normalizeHostPath("C:\\Users\\me\\project", {
        platform: "linux",
        env: { WSL_DISTRO_NAME: "Ubuntu" },
        execFileSync:
          execFileSync as unknown as typeof import("child_process").execFileSync,
      }),
    ).toBe("/mnt/c/Users/me/project");
  });

  it("falls back to /mnt drive paths when wslpath is unavailable", () => {
    const execFileSync = vi.fn(() => {
      throw new Error("wslpath unavailable");
    });

    expect(
      normalizeHostPath("D:\\work\\repo", {
        platform: "linux",
        env: { WSL_DISTRO_NAME: "Ubuntu" },
        execFileSync:
          execFileSync as unknown as typeof import("child_process").execFileSync,
      }),
    ).toBe("/mnt/d/work/repo");
  });

  it("resolves relative paths from the project root", () => {
    expect(resolveHostPath("/home/me/app", "./api")).toBe("/home/me/app/api");
  });
});
