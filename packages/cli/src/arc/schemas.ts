import { z } from "zod";

// The `deploy:` block in a project's zap.yaml. ArcNet owns this schema;
// Zapper strips the key unseen. Module-specific params are validated by the
// module implementations, so unknown keys pass through here.
export const serviceDeploySchema = z
  .object({
    module: z.string(),
    domain: z.string().optional(),
    port: z.number().optional(),
    env: z.array(z.string()).default([]),
    // Literal, committed, non-secret values — merged over the whitelisted
    // pool. For values that differ from .env.production (e.g. the parallel
    // stack's URLs). Never put secrets here.
    "env-values": z.record(z.string(), z.string()).default({}),
  })
  .passthrough();

export const deployBlockSchema = z.object({
  "env-resolver": z.string().optional(),
  // Exception only — by convention the GCP project is <project-prefix>-<slug>.
  "gcp-project": z.string().optional(),
  services: z.record(z.string(), serviceDeploySchema),
});

export const networkConfigSchema = z.object({
  name: z.string(),
  gcp: z.object({
    // Optional convention layer: derive each project's GCP project as
    // `<project-prefix>-<slug>`. Without it, every project must state its
    // own `gcp-project` in the deploy block — the generic, explicit path.
    // Either way each code project gets its own GCP project: the
    // inventory/teardown/drift unit (labels stamped as well).
    "project-prefix": z.string().optional(),
    // Network-level GCP project: holds the Terraform state bucket (and later
    // shared services).
    "network-project": z.string(),
    region: z.string(),
    "state-bucket": z.string(),
    "billing-account": z.string().optional(),
  }),
  dns: z.object({
    zone: z.string(),
  }),
  // Shared MongoDB Atlas cluster (network-level infra). When present,
  // shared-mongo bindings create a scoped Atlas user via Terraform; when
  // absent, they fall back to the ARC_SHARED_MONGO_URL_TEMPLATE credential.
  atlas: z
    .object({
      "project-id": z.string(),
      "cluster-host": z.string(),
    })
    .optional(),
  env: z.object({
    resolver: z.string(),
    "public-file": z.string().default(".env.production"),
  }),
  // Module library override: a local path (git URLs once module resolution
  // lands). Default: the modules bundled with the zap package.
  modules: z.string().optional(),
});

export type ServiceDeploy = z.infer<typeof serviceDeploySchema>;
export type DeployBlock = z.infer<typeof deployBlockSchema>;
export type NetworkConfig = z.infer<typeof networkConfigSchema>;

export interface ProjectManifest {
  slug: string;
  deploy: DeployBlock;
  localServiceNames: string[];
}
