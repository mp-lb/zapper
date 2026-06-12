import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NetworkConfig, ProjectManifest, ServiceDeploy } from "./schemas";
import { ModuleInstance } from "./modules";
import { resolveServiceEnv } from "./env";
import {
  expandVars,
  expandVarsDeep,
  renderRefs,
  renderRefsDeep,
  collectOutputRefs,
  kebabKeysToSnake,
} from "./template";

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

function tfEscapeDeep<T>(value: T): T {
  if (typeof value === "string") return tfEscape(value) as T;
  if (Array.isArray(value)) return value.map(tfEscapeDeep) as T;

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, tfEscapeDeep(v)]),
    ) as T;
  }

  return value;
}

export interface ContainerBuild {
  service: string;
  image: string;
  dockerfile: string;
}

export interface Deployment {
  dir: string;
  project: string;
  instances: ModuleInstance[];
  containerBuilds: ContainerBuild[];
  serviceUrls: Record<string, string>;
  // Raw resolved env (pool whitelist + literals, no injections) per service —
  // what hooks run with.
  serviceEnv: Record<string, Record<string, string>>;
  // Per-instance merged params, keys as written (kebab) — the {{params.*}}
  // namespace for hooks and module.yaml templates.
  hookParams: Record<string, Record<string, unknown>>;
  // Root outputs wired for {{output.*}} hook references.
  outputNames: string[];
  // terraform -target args for the staged project-modules apply.
  projectTargets: string[];
  hasRemote: boolean;
}

interface RenderOptions {
  manifest: ProjectManifest;
  network: NetworkConfig;
  creds: Record<string, string>;
  envPool: Record<string, string>;
  imageTag: string;
  instances: ModuleInstance[];
  // Re-render into an existing dir (after remote module.yaml discovery).
  dir?: string;
}

export function renderDeployment(opts: RenderOptions): Deployment {
  const { manifest, network, creds, envPool, imageTag, instances } = opts;
  const slug = manifest.slug;

  // The {var} vocabulary: built-ins + the network's extra keys (which may
  // themselves reference the built-ins, e.g. gcp-project: mp-lb-{slug}).
  const baseVars = { slug, network: network.name };

  const networkVars = expandVarsDeep(
    network.vars,
    baseVars,
    "network config vars",
  );

  // Project-level var overrides win over the network's (exceptions only).
  const ctx: Record<string, string> = {
    ...networkVars,
    ...expandVarsDeep(
      manifest.deploy.vars,
      { ...networkVars, ...baseVars },
      "deploy block vars",
    ),
    ...baseVars,
  };

  const registryBase = network.registry
    ? expandVars(network.registry, ctx, "network registry template")
    : undefined;

  const warnedCreds = new Set<string>();

  const credValue = (key: string, what: string): string => {
    const value = creds[key];

    if (value === undefined) {
      if (!warnedCreds.has(key)) {
        warnedCreds.add(key);
        console.warn(
          `warning: credential ${key} not set (${what}) — rendered empty`,
        );
      }

      return "";
    }

    return value;
  };

  const byKey = new Map<string, ModuleInstance>();

  for (const instance of instances) {
    if (byKey.has(instance.key)) {
      throw new Error(
        `Deploy entry key '${instance.key}' is used by both a project entry and a service — keys must be unique across deploy.project and deploy.services.`,
      );
    }

    byKey.set(instance.key, instance);
  }

  const containerBuilds: ContainerBuild[] = [];
  const serviceUrls: Record<string, string> = {};
  const serviceEnv: Record<string, Record<string, string>> = {};
  const hookParams: Record<string, Record<string, unknown>> = {};
  const tfParams = new Map<ModuleInstance, Record<string, unknown>>();
  const outputs: Record<string, { value: string; sensitive: boolean }> = {};
  const containerInstances: ModuleInstance[] = [];

  // Pass 1 — per-instance params. Merge order: module variables.tf defaults
  // (Terraform's own) < module.yaml defaults < network module-defaults <
  // deploy block. Keys go kebab→snake; values pass through verbatim.
  for (const instance of instances) {
    const { key, kind, manifest: mod, block } = instance;
    const ictx = { ...ctx, service: key };

    const moduleDefaults = expandVarsDeep(
      mod.defaults,
      ictx,
      `module '${instance.ref}' defaults`,
    );

    const networkDefaults = expandVarsDeep(
      network.moduleDefaults[instance.ref] ?? {},
      ictx,
      `network module-defaults for '${instance.ref}'`,
    );

    const { params: blockParams = {}, ...blockStructural } = block as Record<
      string,
      unknown
    > & { params?: Record<string, unknown> };

    // Hook templates ({{params.*}}) see module params and arc's structural
    // keys (e.g. deploy-path) in one namespace.
    hookParams[key] = {
      ...moduleDefaults,
      ...networkDefaults,
      ...blockParams,
      ...blockStructural,
    };

    // Params are data, never Terraform expressions — escape them.
    const params: Record<string, unknown> = tfEscapeDeep({
      ...kebabKeysToSnake(moduleDefaults),
      ...kebabKeysToSnake(networkDefaults),
      ...kebabKeysToSnake(blockParams),
    });

    // Structural keys arc owns. A domain brings the network's DNS zone with
    // it — modules do their own zone lookup.
    if (block.domain) {
      params.domain = block.domain;
      params.dns_zone = block["dns-zone"] ?? network.dns.zone;
      if (kind === "service") serviceUrls[key] = `https://${block.domain}`;
    }

    if (kind === "service") {
      const service = block as ServiceDeploy;
      const envEntries = service.env ?? [];
      serviceEnv[key] = resolveServiceEnv(envEntries, envPool, key);

      if (mod.action === "container") {
        if (!registryBase) {
          throw new Error(
            `Service '${key}' uses container module '${instance.ref}' but the network config has no registry: template.`,
          );
        }

        const image = `${registryBase}/${key}:${imageTag}`;

        containerBuilds.push({
          service: key,
          image,
          dockerfile: service.dockerfile ?? "Dockerfile",
        });

        params.image = image;
        containerInstances.push(instance);
      }
    }

    tfParams.set(instance, params);

    // Hooks read module outputs after apply via root outputs.
    const hookText = [
      ...mod.hooks["pre-apply"],
      ...mod.hooks["post-apply"],
    ].flatMap((hook) => [
      hook.run ?? "",
      hook.task ?? "",
      ...Object.values(hook.env),
    ]);

    for (const name of hookText.flatMap(collectOutputRefs)) {
      outputs[`${instance.tfName}_${name}`] = {
        value: `\${module.${instance.tfName}.${name}}`,
        sensitive: true,
      };
    }
  }

  // Pass 2 — env injections. A module's manifest may inject env vars into
  // every sibling container service: bindings stay zero-config.
  const injected: Record<string, string> = {};

  for (const instance of instances) {
    for (const [envKey, template] of Object.entries(instance.manifest.env)) {
      injected[envKey] = renderRefs(
        tfEscape(template),
        (ns, key) => {
          if (ns === "output") return `\${module.${instance.tfName}.${key}}`;
          if (ns === "cred")
            return tfEscape(
              credValue(key, `module '${instance.ref}' env injection`),
            );
          if (ns === "params")
            return tfEscape(String(hookParams[instance.key][key] ?? ""));
          throw new Error(`unknown reference namespace '${ns}'`);
        },
        `module '${instance.ref}' env injection ${envKey}`,
      );
    }
  }

  // Injections fill the gaps; a service's own env entries (whitelist or
  // literal) win on conflict — divergence is declared explicitly.
  for (const instance of containerInstances) {
    const params = tfParams.get(instance)!;
    params.env = { ...injected, ...tfEscapeMap(serviceEnv[instance.key]) };
  }

  // Assemble Terraform JSON.
  const modules: Record<string, Record<string, unknown>> = {};

  for (const instance of instances) {
    const dependsOn = (instance.block["depends-on"] ?? []).map((dep) => {
      const target = byKey.get(dep);

      if (!target) {
        throw new Error(
          `'${instance.key}' depends-on unknown deploy entry '${dep}'.`,
        );
      }

      return `module.${target.tfName}`;
    });

    modules[instance.tfName] = {
      source: instance.source,
      ...tfParams.get(instance),
      ...(dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
    };
  }

  const requiredProviders = Object.fromEntries(
    Object.entries(network.providers).map(([name, provider]) => [
      name,
      {
        source: provider.source,
        ...(provider.version ? { version: provider.version } : {}),
      },
    ]),
  );

  const providerBlocks: Record<string, unknown> = {};

  for (const [name, provider] of Object.entries(network.providers)) {
    if (!provider.config) continue;

    const expanded = tfEscapeDeep(
      expandVarsDeep(provider.config, ctx, `provider '${name}' config`),
    );

    providerBlocks[name] = renderRefsDeep(
      expanded,
      (ns, key) => {
        if (ns === "cred")
          return tfEscape(credValue(key, `provider '${name}'`));
        throw new Error(`unknown reference namespace '${ns}'`);
      },
      `provider '${name}' config`,
    );
  }

  const main = {
    terraform: {
      required_version: ">= 1.4",
      required_providers: requiredProviders,
      ...(network.backend
        ? {
            backend: tfEscapeDeep(
              expandVarsDeep(network.backend, ctx, "network backend config"),
            ),
          }
        : {}),
    },
    ...(Object.keys(providerBlocks).length > 0
      ? { provider: providerBlocks }
      : {}),
    module: modules,
    ...(Object.keys(outputs).length > 0 ? { output: outputs } : {}),
  };

  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), `zap-arc-${slug}-`));

  writeFileSync(join(dir, "main.tf.json"), JSON.stringify(main, null, 2), {
    mode: 0o600,
  });

  return {
    dir,
    project: slug,
    instances,
    containerBuilds,
    serviceUrls,
    serviceEnv,
    hookParams,
    outputNames: Object.keys(outputs),
    projectTargets: instances
      .filter((instance) => instance.kind === "project")
      .map((instance) => `module.${instance.tfName}`),
    hasRemote: instances.some((instance) => instance.remote),
  };
}
