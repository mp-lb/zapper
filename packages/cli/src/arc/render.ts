import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NetworkConfig, ProjectManifest, ServiceDeploy } from "./schemas";
import { whitelistEnv } from "./env";
import { requireCredential } from "./creds";
import { projectGcpId } from "./network";

// Terraform's JSON syntax runs template interpolation on every string, so
// literal values must escape ${ and %{ . Module references are inserted raw.
function tfEscape(value: string): string {
  return value.replaceAll("${", "$${").replaceAll("%{", "%%{");
}

function tfEscapeMap(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, tfEscape(v)]),
  );
}

function tfName(service: string): string {
  return `svc_${service.replaceAll("-", "_")}`;
}

export interface ContainerBuild {
  service: string;
  image: string;
  dockerfile: string;
}

export interface VercelDeploy {
  service: string;
  outputName: string;
  deployPath: string;
  build?: string;
  localConfig?: string;
  remoteBuild: boolean;
  env: Record<string, string>;
}

export interface WorkerRef {
  service: string;
  instanceName: string;
}

export interface Deployment {
  dir: string;
  project: string;
  gcpProject: string;
  containerBuilds: ContainerBuild[];
  vercelDeploys: VercelDeploy[];
  workers: WorkerRef[];
  serviceUrls: Record<string, string>;
}

interface RenderOptions {
  manifest: ProjectManifest;
  network: NetworkConfig;
  creds: Record<string, string>;
  envPool: Record<string, string>;
  imageTag: string;
}

function param(svc: ServiceDeploy, key: string): unknown {
  return (svc as Record<string, unknown>)[key];
}

export function renderDeployment(opts: RenderOptions): Deployment {
  const { manifest, network, creds, envPool, imageTag } = opts;
  const slug = manifest.slug;
  const services = Object.entries(manifest.deploy.services);

  // One GCP project per code project: the inventory/teardown/drift boundary.
  const MODULES_DIR = network.modules;

  if (!MODULES_DIR) {
    throw new Error(
      "network config has no resolved modules path (loadNetwork bug)",
    );
  }

  const gcpProject = projectGcpId(
    network,
    slug,
    manifest.deploy["gcp-project"],
  );

  const registry = `${network.gcp.region}-docker.pkg.dev/${gcpProject}/${slug}`;

  const byModule = (m: string) => services.filter(([, s]) => s.module === m);
  const cloudRuns = byModule("cloud-run-web");
  const gceWorkers = byModule("gce-worker");
  const vercels = byModule("vercel-static");
  const redises = byModule("upstash-redis");
  const sharedRedises = byModule("shared-redis");
  const mongos = byModule("shared-mongo");

  if (redises.length + sharedRedises.length > 1)
    throw new Error("At most one redis service supported");
  if (mongos.length > 1)
    throw new Error("At most one shared-mongo service supported");

  const modules: Record<string, Record<string, unknown>> = {
    network: {
      source: join(MODULES_DIR, "network"),
      zone: network.dns.zone,
    },
    base: {
      source: join(MODULES_DIR, "project-base"),
      project_slug: slug,
      region: network.gcp.region,
    },
  };

  // Bindings: env vars injected into every container service. Values are
  // either Terraform references (redis/mongo modules, raw) or literals
  // (escaped).
  const injected: Record<string, string> = {};

  if (redises.length === 1) {
    const [name, svc] = redises[0];
    const envVar = (param(svc, "env-var") as string) ?? "REDIS_URL";
    injected[envVar] = `\${module.${tfName(name)}.redis_url}`;
  }

  // Shared Redis: one network instance, cooperative isolation via a
  // per-project queue prefix (apps read QUEUE_PREFIX; see job-system).
  if (sharedRedises.length === 1) {
    const [, svc] = sharedRedises[0];
    const envVar = (param(svc, "env-var") as string) ?? "REDIS_URL";

    const prefixEnvVar =
      (param(svc, "prefix-env-var") as string) ?? "QUEUE_PREFIX";

    injected[envVar] = tfEscape(
      requireCredential(creds, "ARC_SHARED_REDIS_URL", "shared-redis binding"),
    );

    injected[prefixEnvVar] = (param(svc, "prefix") as string) ?? slug;
  }

  if (mongos.length === 1) {
    const [name, svc] = mongos[0];
    const envVar = (param(svc, "env-var") as string) ?? "MONGODB_URL";
    const database = (param(svc, "database") as string) ?? slug;

    if (network.atlas) {
      // IaC binding: scoped Atlas user created on the shared cluster.
      modules[tfName(name)] = {
        source: join(MODULES_DIR, "shared-mongo-atlas"),
        atlas_project_id: network.atlas["project-id"],
        cluster_host: network.atlas["cluster-host"],
        username: (param(svc, "username") as string) ?? `arc-${slug}`,
        database,
      };

      injected[envVar] = `\${module.${tfName(name)}.url}`;
    } else {
      // Generic fallback: caller-supplied URL template.
      const template = requireCredential(
        creds,
        "ARC_SHARED_MONGO_URL_TEMPLATE",
        "shared-mongo binding; a connection URL containing a {db} placeholder",
      );

      if (!template.includes("{db}")) {
        throw new Error(
          "ARC_SHARED_MONGO_URL_TEMPLATE must contain a {db} placeholder",
        );
      }

      injected[envVar] = tfEscape(template.replaceAll("{db}", database));
    }
  }

  // Whitelisted pool values, overridden by committed env-values literals.
  const rawEnv = (
    name: string,
    svc: ServiceDeploy,
  ): Record<string, string> => ({
    ...whitelistEnv(envPool, svc.env, name),
    ...svc["env-values"],
  });

  const containerEnv = (
    name: string,
    svc: ServiceDeploy,
  ): Record<string, string> => ({
    ...tfEscapeMap(rawEnv(name, svc)),
    ...injected,
  });

  const outputs: Record<string, { value: string; sensitive?: boolean }> = {};
  const containerBuilds: ContainerBuild[] = [];
  const vercelDeploys: VercelDeploy[] = [];
  const workers: WorkerRef[] = [];
  const serviceUrls: Record<string, string> = {};

  for (const [name, svc] of cloudRuns) {
    if (!svc.domain)
      throw new Error(`cloud-run-web service '${name}' needs a domain`);
    const image = `${registry}/${name}:${imageTag}`;

    containerBuilds.push({
      service: name,
      image,
      dockerfile:
        (param(svc, "dockerfile") as string) ?? `apps/${name}/Dockerfile`,
    });

    modules[tfName(name)] = {
      source: join(MODULES_DIR, "cloud-run-web"),
      name: `${slug}-${name}`,
      gcp_project_id: gcpProject,
      region: network.gcp.region,
      image,
      port: svc.port ?? 8080,
      env: containerEnv(name, svc),
      domain: svc.domain,
      zone_id: "${module.network.zone_id}",
      min_instances: (param(svc, "min-instances") as number) ?? 0,
      max_instances: (param(svc, "max-instances") as number) ?? 2,
      memory: (param(svc, "memory") as string) ?? "512Mi",
      cpu: (param(svc, "cpu") as string) ?? "1",
      concurrency: (param(svc, "concurrency") as number) ?? 80,
      health_path: (param(svc, "health-path") as string) ?? "/health",
    };

    serviceUrls[name] = `https://${svc.domain}`;
  }

  for (const [name, svc] of gceWorkers) {
    const image = `${registry}/${name}:${imageTag}`;
    const instanceName = `${slug}-${name}`;

    containerBuilds.push({
      service: name,
      image,
      dockerfile:
        (param(svc, "dockerfile") as string) ?? `apps/${name}/Dockerfile`,
    });

    workers.push({ service: name, instanceName });

    modules[tfName(name)] = {
      source: join(MODULES_DIR, "gce-worker"),
      name: instanceName,
      region: network.gcp.region,
      image,
      env: containerEnv(name, svc),
      machine_type: (param(svc, "machine-type") as string) ?? "e2-micro",
    };
  }

  for (const [name, svc] of vercels) {
    if (!svc.domain)
      throw new Error(`vercel-static service '${name}' needs a domain`);
    const outputName = `${tfName(name)}_project_id`;

    modules[tfName(name)] = {
      source: join(MODULES_DIR, "vercel-static"),
      name: (param(svc, "vercel-name") as string) ?? `${slug}-${name}-arc`,
      domain: svc.domain,
      zone: network.dns.zone,
      zone_id: "${module.network.zone_id}",
      www_redirect:
        (param(svc, "www-redirect") as boolean) ??
        svc.domain === network.dns.zone,
      framework: (param(svc, "framework") as string) ?? null,
      root_directory: (param(svc, "root-directory") as string) ?? null,
    };

    outputs[outputName] = { value: `\${module.${tfName(name)}.project_id}` };

    vercelDeploys.push({
      service: name,
      outputName,
      deployPath: (param(svc, "deploy-path") as string) ?? `apps/${name}/dist`,
      build: param(svc, "build") as string | undefined,
      localConfig: param(svc, "local-config") as string | undefined,
      remoteBuild: (param(svc, "remote-build") as boolean) ?? false,
      env: rawEnv(name, svc),
    });

    serviceUrls[name] = `https://${svc.domain}`;
  }

  for (const [name] of redises) {
    modules[tfName(name)] = {
      source: join(MODULES_DIR, "upstash-redis"),
      name: `${slug}-${name}-arc`,
    };
  }

  const providers: Record<string, unknown> = {
    google: {
      project: gcpProject,
      region: network.gcp.region,
      // Stamped on every label-supporting resource — the cross-check on top
      // of the per-project boundary.
      default_labels: { "arc-managed": "true", "arc-project": slug },
    },
    cloudflare: {
      api_token: requireCredential(
        creds,
        "CLOUDFLARE_API_TOKEN",
        "DNS records",
      ),
    },
    vercel: {
      api_token: requireCredential(
        creds,
        "VERCEL_API_TOKEN",
        "Vercel projects",
      ),
    },
  };

  const requiredProviders: Record<string, unknown> = {
    google: { source: "hashicorp/google", version: "~> 5.0" },
    cloudflare: { source: "cloudflare/cloudflare", version: "~> 4.0" },
    vercel: { source: "vercel/vercel", version: "~> 1.0" },
  };

  if (redises.length > 0) {
    providers.upstash = {
      email: requireCredential(creds, "UPSTASH_EMAIL", "Upstash Redis"),
      api_key: requireCredential(creds, "UPSTASH_API_KEY", "Upstash Redis"),
    };

    requiredProviders.upstash = {
      source: "upstash/upstash",
      version: "~> 1.0",
    };
  }

  if (network.atlas && mongos.length > 0) {
    providers.mongodbatlas = {
      public_key: requireCredential(
        creds,
        "MONGODB_ATLAS_PUBLIC_KEY",
        "Atlas binding",
      ),
      private_key: requireCredential(
        creds,
        "MONGODB_ATLAS_PRIVATE_KEY",
        "Atlas binding",
      ),
    };

    requiredProviders.mongodbatlas = {
      source: "mongodb/mongodbatlas",
      version: "~> 1.0",
    };
  }

  const main = {
    terraform: {
      required_version: ">= 1.0",
      required_providers: requiredProviders,
      backend: {
        gcs: {
          bucket: network.gcp["state-bucket"],
          prefix: `terraform/state/${slug}`,
        },
      },
    },
    provider: providers,
    module: modules,
    output: outputs,
  };

  const dir = mkdtempSync(join(tmpdir(), `zap-arc-${slug}-`));
  writeFileSync(join(dir, "main.tf.json"), JSON.stringify(main, null, 2), {
    mode: 0o600,
  });

  return {
    dir,
    project: slug,
    gcpProject,
    containerBuilds,
    vercelDeploys,
    workers,
    serviceUrls,
  };
}
