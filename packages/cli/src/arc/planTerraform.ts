import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getFoundationChanges } from "./getFoundationChanges";
import { getResourceChanges } from "./getResourceChanges";

export const planTerraform = (dir: string, targets: string[] = []) => {
  const path = join(dir, "reviewed.tfplan");

  const result = spawnSync(
    "terraform",
    [
      "plan",
      "-input=false",
      "-lock-timeout=10m",
      `-out=${path}`,
      ...targets.map((target) => `-target=${target}`),
    ],
    { cwd: dir, stdio: "inherit" },
  );

  if (result.error || result.status !== 0)
    throw new Error("Terraform plan failed; no apply was attempted.");

  // Plans may contain secrets. Parse privately and only report resource addresses.
  const shown = spawnSync("terraform", ["show", "-json", path], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (shown.error || shown.status !== 0)
    throw new Error(
      "Could not inspect the saved Terraform plan; no apply was attempted.",
    );

  const plan: unknown = JSON.parse(shown.stdout);
  const changes = getFoundationChanges(plan);
  if (targets.length && getResourceChanges(plan).length !== changes.length)
    throw new Error(
      "Foundation plan includes application resources; refusing to apply it. Remove service dependencies from project modules.",
    );
  return { path, changes };
};
