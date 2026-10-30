import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const createWorktreeFixture = (
  outputRoot: string,
  name = "checkout-fixture",
) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    throw new Error(
      "Fixture name must contain only letters, numbers, underscores or hyphens.",
    );
  const mainDir = resolve(outputRoot, `${name}-main`);
  const worktreeDir = resolve(outputRoot, `${name}-worktree`);
  for (const directory of [mainDir, worktreeDir])
    rmSync(directory, { recursive: true, force: true });
  mkdirSync(mainDir, { recursive: true });
  execFileSync("git", ["init", mainDir], { stdio: "ignore" });

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", mainDir, ...args], { stdio: "ignore" });

  git("config", "user.name", "Zapper E2E");
  git("config", "user.email", "zapper-e2e@example.com");
  writeFileSync(
    join(mainDir, "zap.yaml"),
    `project: instance-checkout-test\nnative:\n  app:\n    cmd: node --import "${import.meta.resolve("tsx")}" fixtureApp.ts\n`,
  );

  copyFileSync(
    new URL("./fixtureApp.ts", import.meta.url),
    join(mainDir, "fixtureApp.ts"),
  );

  writeFileSync(join(mainDir, "README.md"), "Instance checkout e2e fixture\n");
  git("add", "README.md", "zap.yaml", "fixtureApp.ts");
  git("commit", "-m", "Initialize instance checkout fixture");
  git("worktree", "add", worktreeDir, "HEAD");
  return { mainDir, worktreeDir };
};
