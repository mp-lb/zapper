import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import {
  moduleManifestSchema,
  ModuleManifest,
  ModuleBlock,
  ProjectManifest,
} from "./schemas";

// One module instance per deploy-block entry. Services and project-level
// entries share the mechanics; only services get service semantics (env map,
// container action, URL printing).
export interface ModuleInstance {
  kind: "service" | "project";
  // The deploy-block entry key (service name / project entry key).
  key: string;
  // Terraform module block name: svc_<key> / prj_<key>.
  tfName: string;
  // The module: reference as written.
  ref: string;
  // Terraform module source: a local absolute path, or the URL verbatim.
  source: string;
  // URL modules: Terraform fetches them; module.yaml is read from
  // .terraform/modules/ after init.
  remote: boolean;
  manifest: ModuleManifest;
  block: ModuleBlock;
}

export const EMPTY_MANIFEST: ModuleManifest = moduleManifestSchema.parse({});

function tfName(kind: "service" | "project", key: string): string {
  const prefix = kind === "service" ? "svc" : "prj";
  return `${prefix}_${key.replaceAll("-", "_")}`;
}

export function loadModuleManifest(dir: string): ModuleManifest {
  const path = join(dir, "module.yaml");
  if (!existsSync(path)) return EMPTY_MANIFEST;

  try {
    return moduleManifestSchema.parse(parse(readFileSync(path, "utf8")) ?? {});
  } catch (error) {
    throw new Error(
      `Invalid module.yaml in ${dir}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

// Module resolution, three ways: bare slug → module library; `./relative` →
// the project dir (the raw-Terraform escape hatch); anything else → passed
// through as a Terraform module source (TF fetches, caches, pins).
function resolveOne(
  kind: "service" | "project",
  key: string,
  block: ModuleBlock,
  modulesDir: string,
  projectDir: string,
): ModuleInstance {
  const ref = block.module;
  const base = { kind, key, tfName: tfName(kind, key), ref, block };

  if (ref.startsWith("./") || ref.startsWith("../")) {
    const dir = resolve(projectDir, ref);

    if (!existsSync(dir)) {
      throw new Error(
        `Module '${ref}' (${kind} '${key}') not found at ${dir}.`,
      );
    }

    return {
      ...base,
      source: dir,
      remote: false,
      manifest: loadModuleManifest(dir),
    };
  }

  if (/^[A-Za-z0-9_-]+$/.test(ref)) {
    const dir = join(modulesDir, ref);

    if (!existsSync(dir)) {
      const available = existsSync(modulesDir)
        ? readdirSync(modulesDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .join(", ")
        : "(module library missing)";

      throw new Error(
        `Unknown module '${ref}' (${kind} '${key}'). Library ${modulesDir} has: ${available}`,
      );
    }

    return {
      ...base,
      source: dir,
      remote: false,
      manifest: loadModuleManifest(dir),
    };
  }

  return { ...base, source: ref, remote: true, manifest: EMPTY_MANIFEST };
}

export function resolveModules(
  manifest: ProjectManifest,
  modulesDir: string,
  projectDir: string,
): ModuleInstance[] {
  const instances: ModuleInstance[] = [];

  for (const [key, block] of Object.entries(manifest.deploy.project)) {
    instances.push(resolveOne("project", key, block, modulesDir, projectDir));
  }

  for (const [key, block] of Object.entries(manifest.deploy.services)) {
    instances.push(resolveOne("service", key, block, modulesDir, projectDir));
  }

  return instances;
}

// After terraform init, fetched modules sit under .terraform/modules/ with an
// index mapping module keys to directories — arc never implements fetching.
export function discoverRemoteManifests(
  renderDir: string,
  instances: ModuleInstance[],
): ModuleInstance[] {
  if (!instances.some((instance) => instance.remote)) return instances;

  const indexPath = join(renderDir, ".terraform/modules/modules.json");

  if (!existsSync(indexPath)) {
    throw new Error(
      `Remote modules in use but ${indexPath} is missing — did terraform init run?`,
    );
  }

  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    Modules: Array<{ Key: string; Dir: string }>;
  };

  const dirs = new Map(index.Modules.map((m) => [m.Key, m.Dir]));

  return instances.map((instance) => {
    if (!instance.remote) return instance;
    const dir = dirs.get(instance.tfName);

    if (!dir) {
      throw new Error(
        `Module '${instance.ref}' (${instance.kind} '${instance.key}') not found in ${indexPath}.`,
      );
    }

    return {
      ...instance,
      manifest: loadModuleManifest(resolve(renderDir, dir)),
    };
  });
}
