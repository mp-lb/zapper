import { existsSync, readFileSync, statSync } from "fs";
import path from "path";

export interface WorktreeInfo {
  isWorktree: boolean;
  mainWorktreePath?: string;
}

/**
 * Detects if the given project directory is a git worktree.
 *
 * A worktree has a .git file (not directory) containing a "gitdir:" pointer
 * to the actual .git directory in the main worktree.
 */
export function detectWorktree(projectRoot: string): WorktreeInfo {
  const gitPath = path.join(projectRoot, ".git");

  if (!existsSync(gitPath)) {
    return { isWorktree: false };
  }

  const stat = statSync(gitPath);
  if (stat.isDirectory()) {
    // This is the main worktree (has .git/ directory)
    return { isWorktree: false };
  }

  if (!stat.isFile()) {
    return { isWorktree: false };
  }

  // .git is a file - this should be a worktree
  try {
    const gitFileContent = readFileSync(gitPath, "utf8").trim();
    const gitdirMatch = gitFileContent.match(/^gitdir:\s*(.+)$/);

    if (!gitdirMatch) {
      return { isWorktree: false };
    }

    const gitdirPath = gitdirMatch[1].trim();
    const resolvedGitdir = path.isAbsolute(gitdirPath)
      ? gitdirPath
      : path.resolve(projectRoot, gitdirPath);

    // The gitdir points to something like .git/worktrees/{name}
    // Walk up to find the main .git directory
    let currentDir = resolvedGitdir;
    while (currentDir !== path.dirname(currentDir)) {
      currentDir = path.dirname(currentDir);
      if (path.basename(currentDir) === ".git") {
        // Found the main .git directory
        const mainWorktreePath = path.dirname(currentDir);
        return {
          isWorktree: true,
          mainWorktreePath,
        };
      }
    }

    // Couldn't find main worktree path, but we know it's a worktree
    return { isWorktree: true };
  } catch (error) {
    // Error reading .git file
    return { isWorktree: false };
  }
}
