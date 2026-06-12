import { z } from "zod";

// The `deploy:` block in a project's zap.yaml. Arc owns this schema; Zapper
// strips the key unseen. Arc keeps a small reserved structural vocabulary;
// every other key passes through verbatim (kebab→snake) as a Terraform
// variable, validated by the module's variables.tf at plan time.
export const RESERVED_MODULE_KEYS = [
  "module",
  "domain",
  "env",
  "dockerfile",
  "build",
  "deploy-path",
  "remote-build",
  "local-config",
  "vercel-name",
  "depends-on",
] as const;

const moduleBlockSchema = z
  .object({
    module: z.string(),
    // Apply-order edges between deploy-block entries (e.g. a registry module
    // depending on the project-factory module), by entry key.
    "depends-on": z.array(z.string()).default([]),
    domain: z.string().optional(),
  })
  .passthrough();

export const serviceDeploySchema = moduleBlockSchema.extend({
  // One env list: bare `KEY` whitelists from the resolved pool,
  // `KEY=value` is a committed literal (split on the first `=`).
  env: z.array(z.string()).default([]),
});

export const deployBlockSchema = z.object({
  "env-resolver": z.string().optional(),
  // Project-level overrides of the network's {var} vocabulary — exceptions
  // only (e.g. a project pinned to a non-convention GCP project id).
  vars: z.record(z.string(), z.string()).default({}),
  // Project-level modules: same module mechanics as services (params,
  // module.yaml, hooks), no service semantics (no env map, no container).
  project: z.record(z.string(), moduleBlockSchema).default({}),
  services: z.record(z.string(), serviceDeploySchema).default({}),
});

// Network config: the sharing seam. All provider knowledge lives here (and in
// modules) as data — the engine understands none of it. Any extra top-level
// string key becomes a `{var}` template variable (e.g. region, gcp-project).
export const networkConfigSchema = z
  .object({
    name: z.string(),
    dns: z.object({ zone: z.string() }),
    env: z.object({
      resolver: z.string(),
      "public-file": z.string().default(".env.production"),
    }),
    // Passthrough → the terraform backend block. Values may use {var}s.
    backend: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    // Passthrough → provider blocks. Config values may use {var}s and
    // {{cred.NAME}}.
    providers: z
      .record(
        z.string(),
        z.object({
          source: z.string(),
          version: z.string().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .default({}),
    // Per-module default params; merge order:
    // module variables.tf defaults < module.yaml defaults < module-defaults
    // < deploy block.
    "module-defaults": z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .default({}),
    // Container image template, e.g. {region}-docker.pkg.dev/{gcp-project}/{slug}.
    // Arc appends /<service>:<tag>.
    registry: z.string().optional(),
    // Module library override: a local path. Default: the modules bundled
    // with the zap package.
    modules: z.string().optional(),
  })
  .passthrough();

export const NETWORK_KNOWN_KEYS = new Set([
  "name",
  "dns",
  "env",
  "backend",
  "providers",
  "module-defaults",
  "registry",
  "modules",
]);

// Optional per-module manifest (module.yaml): only what Terraform can't
// declare. A bare Terraform folder with no module.yaml is a valid module.
const hookSchema = z
  .object({
    name: z.string().optional(),
    run: z.string().optional(),
    task: z.string().optional(),
    env: z.record(z.string(), z.string()).default({}),
  })
  .strict()
  .refine((hook) => Boolean(hook.run) !== Boolean(hook.task), {
    message: "a hook needs exactly one of run: or task:",
  });

export const moduleManifestSchema = z
  .object({
    // The only built-in provider action: docker build + push, with the image
    // and resolved env passed as Terraform variables.
    action: z.literal("container").optional(),
    // Default params (kebab keys fine); values may use {var}s.
    defaults: z.record(z.string(), z.unknown()).default({}),
    // Operator credentials this module needs — checked early, injected into
    // hook processes, usable as {{cred.NAME}}.
    credentials: z
      .array(z.object({ name: z.string(), why: z.string() }))
      .default([]),
    // Env vars injected into every sibling container service. Values may use
    // {{output.*}} (a Terraform reference), {{cred.*}}, {{params.*}}.
    env: z.record(z.string(), z.string()).default({}),
    hooks: z
      .object({
        "pre-apply": z.array(hookSchema).default([]),
        "post-apply": z.array(hookSchema).default([]),
      })
      .default({ "pre-apply": [], "post-apply": [] }),
  })
  .strict();

export type ModuleBlock = z.infer<typeof moduleBlockSchema>;
export type ServiceDeploy = z.infer<typeof serviceDeploySchema>;
export type DeployBlock = z.infer<typeof deployBlockSchema>;
export type NetworkProvider = z.infer<
  typeof networkConfigSchema
>["providers"][string];
export type ModuleManifest = z.infer<typeof moduleManifestSchema>;
export type ModuleHook = z.infer<typeof hookSchema>;

// The parsed network config plus what loadNetwork derives from it.
export interface NetworkConfig {
  name: string;
  dns: { zone: string };
  env: { resolver: string; "public-file": string };
  backend?: Record<string, Record<string, unknown>>;
  providers: Record<string, NetworkProvider>;
  moduleDefaults: Record<string, Record<string, unknown>>;
  registry?: string;
  // Resolved module library path (bundled by default).
  modulesDir: string;
  // Extra top-level string keys — the {var} template vocabulary.
  vars: Record<string, string>;
}

export interface ProjectManifest {
  slug: string;
  deploy: DeployBlock;
  localServiceNames: string[];
}
