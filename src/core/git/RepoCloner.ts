import { execSync } from "child_process";
import { renderer } from "../../ui/renderer";
import * as fs from "fs";
import * as path from "path";

export type GitMethod = "ssh" | "http" | "cli";

export interface CloneTarget {
  name: string;
  repo: string;
  destDir: string;
}

export class RepoCloner {
  static ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  static isGitRepo(dir: string): boolean {
    return fs.existsSync(path.join(dir, ".git"));
  }

  static isEmptyDir(dir: string): boolean {
    try {
      const files = fs.readdirSync(dir);
      return files.length === 0;
    } catch {
      return true;
    }
  }

  static toSshUrl(spec: string): string {
    if (spec.startsWith("git@")) return spec;
    if (spec.startsWith("ssh://")) return spec;
    if (spec.startsWith("http://")) return spec;
    if (spec.startsWith("https://")) return spec;
    return `git@github.com:${spec}.git`;
  }

  static toHttpUrl(spec: string): string {
    if (spec.startsWith("http://")) return spec;
    if (spec.startsWith("https://")) return spec;

    if (spec.startsWith("git@")) {
      return `https://github.com/${spec.split(":")[1]?.replace(/\.git$/, "")}.git`;
    }

    return `https://github.com/${spec}.git`;
  }

  static cloneWithGit(url: string, dir: string, processName: string): void {
    const parent = path.dirname(dir);
    this.ensureDir(parent);
    const folderName = path.basename(dir);
    const parentIsRepo = this.isGitRepo(dir);

    if (!fs.existsSync(dir) || this.isEmptyDir(dir)) {
      renderer.log.info(`Cloning ${processName} -> ${dir}`);

      execSync(`git clone ${url} ${folderName}`, {
        cwd: parent,
        stdio: "inherit",
      });
    } else if (parentIsRepo || this.isGitRepo(dir)) {
      renderer.log.info(`Pulling ${processName} in ${dir}`);
      execSync(`git -C ${dir} pull --ff-only`, { stdio: "inherit" });
    } else {
      renderer.log.warn(
        `Destination ${dir} exists and is not empty. Skipping ${processName}.`,
      );
    }
  }

  static cloneWithGh(spec: string, dir: string, processName: string): void {
    const parent = path.dirname(dir);
    this.ensureDir(parent);

    if (!fs.existsSync(dir) || this.isEmptyDir(dir)) {
      renderer.log.info(`Cloning (gh) ${processName} -> ${dir}`);
      execSync(`gh repo clone ${spec} ${dir}`, { stdio: "inherit" });
    } else if (this.isGitRepo(dir)) {
      renderer.log.info(`Pulling ${processName} in ${dir}`);
      execSync(`git -C ${dir} pull --ff-only`, { stdio: "inherit" });
    } else {
      renderer.log.warn(
        `Destination ${dir} exists and is not empty. Skipping ${processName}.`,
      );
    }
  }

  static async cloneRepo(
    target: CloneTarget,
    method: GitMethod,
  ): Promise<void> {
    try {
      if (method === "cli") {
        this.cloneWithGh(target.repo, target.destDir, target.name);
      } else if (method === "http") {
        this.cloneWithGit(
          this.toHttpUrl(target.repo),
          target.destDir,
          target.name,
        );
      } else {
        this.cloneWithGit(
          this.toSshUrl(target.repo),
          target.destDir,
          target.name,
        );
      }
    } catch (e) {
      renderer.log.warn(`Failed to clone ${target.name}: ${e}`);
    }
  }

  static async cloneMultiple(
    targets: CloneTarget[],
    method: GitMethod,
  ): Promise<void> {
    for (const target of targets) {
      await this.cloneRepo(target, method);
    }
  }
}
