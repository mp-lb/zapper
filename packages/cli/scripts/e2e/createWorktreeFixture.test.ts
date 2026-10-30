import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createWorktreeFixture } from "./createWorktreeFixture";

it("creates two clean checkouts of the same commit with the typed app fixture", () => {
  const root = mkdtempSync(join(tmpdir(), "zapper-worktree-script-"));

  try {
    const { mainDir, worktreeDir } = createWorktreeFixture(root, "test");

    const git = (directory: string, ...args: string[]) =>
      execFileSync("git", ["-C", directory, ...args], {
        encoding: "utf8",
      }).trim();

    expect(git(worktreeDir, "rev-parse", "HEAD")).toBe(
      git(mainDir, "rev-parse", "HEAD"),
    );

    expect(git(mainDir, "status", "--porcelain")).toBe("");
    expect(git(worktreeDir, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(worktreeDir, "fixtureApp.ts"), "utf8")).toContain(
      "instance checkout fixture",
    );

    expect(readFileSync(join(worktreeDir, "zap.yaml"), "utf8")).toContain(
      "fixtureApp.ts",
    );

    expect(() => createWorktreeFixture(root, "../escape")).toThrow(
      "Fixture name",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
