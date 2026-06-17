import { execSync } from "child_process";
import { renderer } from "../../ui/renderer";
import * as fs from "fs";
import * as path from "path";

export interface GitTarget {
  name: string;
  cwd: string;
}

export class GitManager {
  static isGitRepo(dir: string): boolean {
    try {
      return fs.existsSync(path.join(dir, ".git"));
    } catch {
      return false;
    }
  }

  static async checkoutAll(
    targets: GitTarget[],
    branch: string,
  ): Promise<void> {
    const failed: string[] = [];

    for (const target of targets) {
      if (!this.isGitRepo(target.cwd)) continue;

      try {
        const status = execSync("git status --porcelain", { cwd: target.cwd })
          .toString()
          .trim();

        if (status.length > 0) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          execSync(`git add -A`, { cwd: target.cwd, stdio: "inherit" });

          execSync(`git commit -m "[WIP] ${ts}"`, {
            cwd: target.cwd,
            stdio: "inherit",
          });
        }

        execSync(`git fetch --all`, { cwd: target.cwd, stdio: "inherit" });

        execSync(`git checkout ${branch}`, {
          cwd: target.cwd,
          stdio: "inherit",
        });
      } catch (e) {
        renderer.log.warn(`Failed to checkout in ${target.name}: ${e}`);
        failed.push(target.name);
      }
    }

    if (failed.length > 0) {
      renderer.log.warn(`Failed for repos: ${failed.join(", ")}`);
    }
  }

  static async pullAll(targets: GitTarget[]): Promise<void> {
    const failed: string[] = [];

    for (const target of targets) {
      if (!this.isGitRepo(target.cwd)) continue;

      try {
        execSync(`git pull --ff-only`, { cwd: target.cwd, stdio: "inherit" });
      } catch (e) {
        renderer.log.warn(`Failed to pull in ${target.name}: ${e}`);
        failed.push(target.name);
      }
    }

    if (failed.length > 0) {
      renderer.log.warn(`Failed for repos: ${failed.join(", ")}`);
    }
  }

  static async statusAll(targets: GitTarget[]): Promise<void> {
    for (const target of targets) {
      if (!this.isGitRepo(target.cwd)) continue;

      try {
        const branch = execSync(`git rev-parse --abbrev-ref HEAD`, {
          cwd: target.cwd,
        })
          .toString()
          .trim();

        const dirty =
          execSync(`git status --porcelain`, { cwd: target.cwd })
            .toString()
            .trim().length > 0;

        renderer.log.info(
          `${target.name}: ${branch}  ${dirty ? "dirty" : "clean"}`,
        );
      } catch (e) {
        renderer.log.warn(`Failed to get status in ${target.name}: ${e}`);
      }
    }
  }

  static async stashAll(targets: GitTarget[]): Promise<void> {
    const failed: string[] = [];

    for (const target of targets) {
      if (!this.isGitRepo(target.cwd)) continue;

      try {
        const status = execSync("git status --porcelain", { cwd: target.cwd })
          .toString()
          .trim();

        if (status.length > 0) {
          execSync(`git stash`, { cwd: target.cwd, stdio: "inherit" });
          renderer.log.info(`Stashed changes in ${target.name}`);
        } else {
          renderer.log.debug(`No changes to stash in ${target.name}`);
        }
      } catch (e) {
        renderer.log.warn(`Failed to stash in ${target.name}: ${e}`);
        failed.push(target.name);
      }
    }

    if (failed.length > 0) {
      renderer.log.warn(`Failed for repos: ${failed.join(", ")}`);
    }
  }
}
