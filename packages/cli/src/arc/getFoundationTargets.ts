import { spawnSync } from "node:child_process";

export const getFoundationTargets = (dir: string, configured: string[]) => {
  const result = spawnSync("terraform", ["state", "list"], {
    cwd: dir,
    encoding: "utf8",
  });

  if (
    result.error ||
    (result.status !== 0 && !result.stderr.includes("No state file was found"))
  )
    throw new Error("Cannot inspect foundation state; no apply was attempted.");

  const previous = result.stdout.split("\n").flatMap((address) => {
    const match = address.match(
      /^(module\.prj_(?:ci|gcp|registry|budget)(?:\[.*?\])?)\./,
    );

    return match ? [match[1]] : [];
  });

  return [
    ...new Set([
      ...configured.filter((target) =>
        /^module\.prj_(?:ci|gcp|registry|budget)$/.test(target),
      ),
      ...previous,
    ]),
  ];
};
