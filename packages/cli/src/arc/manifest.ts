import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { deployBlockSchema, ProjectManifest } from "./schemas";

// ArcNet reads zap.yaml itself — never through Zapper. Zapper owns everything
// outside `deploy:`; we only look at `project`, the service name keys, and
// `deploy:` itself.
export function loadManifest(projectDir: string): ProjectManifest {
  const path = join(projectDir, "zap.yaml");

  if (!existsSync(path)) {
    throw new Error(
      `No zap.yaml in ${projectDir} — run zap arc from a project directory.`,
    );
  }

  const raw = parse(readFileSync(path, "utf8"));

  if (!raw?.project || typeof raw.project !== "string") {
    throw new Error(`zap.yaml has no project name`);
  }

  if (!raw.deploy) {
    throw new Error(`zap.yaml has no deploy: block — nothing to deploy.`);
  }

  const deploy = deployBlockSchema.parse(raw.deploy);

  const localServiceNames = [
    ...Object.keys(raw.native ?? {}),
    ...Object.keys(raw.docker ?? {}),
    ...Object.keys(raw.containers ?? {}),
  ];

  return { slug: raw.project, deploy, localServiceNames };
}
