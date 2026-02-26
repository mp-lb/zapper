import { ZapperConfig } from "../../config/schemas";
import { RepoCloner, CloneTarget, GitMethod } from "./RepoCloner";
import { buildAliasMap, resolveAliasesToCanonical } from "../../utils";
import { renderer } from "../../ui/renderer";
import * as path from "path";

export async function cloneRepos(
  config: ZapperConfig,
  configDir: string,
  processNames?: string[],
): Promise<void> {
  const method = (config.git_method || "ssh") as GitMethod;

  const allNative = config.native
    ? Object.entries(config.native).map(([name, p]) => ({
        ...p,
        name: (p.name as string) || name,
      }))
    : [];

  // Build alias map for resolution
  const processes = allNative;
  const containers =
    config.docker || config.containers
      ? Object.entries(config.docker || config.containers || {})
      : [];
  const aliasMap = buildAliasMap(processes, containers);
  const canonical = resolveAliasesToCanonical(processNames, aliasMap);

  const targets = canonical
    ? allNative.filter((p) => canonical.includes(p.name as string))
    : allNative;

  if (targets.length === 0) {
    renderer.log.info("No native services to clone");
    return;
  }

  const cloneTargets: CloneTarget[] = [];

  for (const process of targets) {
    if (!process.repo) {
      renderer.log.debug(`Skipping ${process.name}: no repo field`);
      continue;
    }

    const destDir = (() => {
      const cwd =
        process.cwd && process.cwd.trim().length > 0
          ? process.cwd
          : process.name;

      return path.isAbsolute(cwd as string)
        ? (cwd as string)
        : path.join(configDir, cwd as string);
    })();

    cloneTargets.push({
      name: process.name as string,
      repo: process.repo,
      destDir,
    });
  }

  await RepoCloner.cloneMultiple(cloneTargets, method);
}
