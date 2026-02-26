import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import { detectWorktree } from "./worktreeDetector";

describe("worktreeDetector", () => {
  const testDir = path.join(__dirname, "../../test-fixtures/worktree-test");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should detect non-worktree when no .git exists", () => {
    const result = detectWorktree(testDir);
    expect(result).toEqual({ isWorktree: false });
  });

  it("should detect non-worktree when .git is a directory", () => {
    const gitDir = path.join(testDir, ".git");
    mkdirSync(gitDir);

    const result = detectWorktree(testDir);
    expect(result).toEqual({ isWorktree: false });
  });

  it("should detect worktree when .git is a file with gitdir", () => {
    const gitFile = path.join(testDir, ".git");
    const mainDir = path.join(testDir, "main-repo");
    const mainGitDir = path.join(mainDir, ".git");

    // Create main git directory structure
    mkdirSync(mainGitDir, { recursive: true });

    // Create worktree .git file pointing to main
    writeFileSync(gitFile, `gitdir: ${mainGitDir}/worktrees/feature-branch`);

    const result = detectWorktree(testDir);
    expect(result.isWorktree).toBe(true);
    expect(result.mainWorktreePath).toBe(mainDir);
  });

  it("should detect worktree with relative gitdir path", () => {
    const gitFile = path.join(testDir, ".git");

    // Create main git directory structure
    const mainDir = path.join(testDir, "main-relative");
    const mainGitDir = path.join(mainDir, ".git");
    mkdirSync(mainGitDir, { recursive: true });

    // Create worktree .git file with relative path
    writeFileSync(
      gitFile,
      "gitdir: main-relative/.git/worktrees/feature-branch",
    );

    const result = detectWorktree(testDir);
    expect(result.isWorktree).toBe(true);
    expect(result.mainWorktreePath).toBe(mainDir);
  });

  it("should handle malformed .git file", () => {
    const gitFile = path.join(testDir, ".git");
    writeFileSync(gitFile, "invalid content");

    const result = detectWorktree(testDir);
    expect(result).toEqual({ isWorktree: false });
  });

  it("should handle .git file without gitdir line", () => {
    const gitFile = path.join(testDir, ".git");
    writeFileSync(gitFile, "some other content\nno gitdir here");

    const result = detectWorktree(testDir);
    expect(result).toEqual({ isWorktree: false });
  });

  it("should handle empty .git file", () => {
    const gitFile = path.join(testDir, ".git");
    writeFileSync(gitFile, "");

    const result = detectWorktree(testDir);
    expect(result).toEqual({ isWorktree: false });
  });

  it("should detect worktree even if main path cannot be resolved", () => {
    const gitFile = path.join(testDir, ".git");
    writeFileSync(gitFile, "gitdir: /nonexistent/path/to/git/worktrees/branch");

    const result = detectWorktree(testDir);
    expect(result.isWorktree).toBe(true);
    expect(result.mainWorktreePath).toBeUndefined();
  });
});
