import { Command } from "commander";
import { execSync, spawnSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadManifest } from "./manifest";
import { loadNetwork } from "./network";
import { loadCredentials, credentialsPath } from "./creds";
import { resolveEnvPool, parseEnvText, bareEnvKeys } from "./env";
import { renderDeployment, Deployment } from "./render";
import {
  resolveModules,
  discoverRemoteManifests,
  ModuleInstance,
} from "./modules";
import { runHooks, requireModuleCredentials } from "./hooks";
import { expandVars } from "./template";
import { NetworkConfig, ProjectManifest } from "./schemas";

// Zap Arc: deploy a zap project to the cloud from its `deploy:` block.
// Self-contained command group — needs no Zapper runtime context, and reads
// zap.yaml itself (zapper-core strips the deploy key at its parse boundary;
// arc owns that schema).
//
// The engine is provider-agnostic: backend, providers, registry and module
// params are data (network config + module library). The only built-in
// provider actions are docker build/push (`action: container`) and the
// gcloud bootstrap convenience below.

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): void {
  console.log(`\n> ${cmd} ${args.join(" ")}`);

  const result = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${cmd} ${args[0] ?? ""} failed (exit ${result.status})`);
  }
}

function capture(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { cwd: opts.cwd, encoding: "utf8" }).trim();
}

function imageTag(projectDir: string): string {
  const sha = capture("git rev-parse --short HEAD", { cwd: projectDir });
  const dirty = capture("git status --porcelain", { cwd: projectDir }) !== "";
  return dirty ? `${sha}-dirty-${Date.now()}` : sha;
}

interface ArcContext {
  projectDir: string;
  network: NetworkConfig;
  creds: Record<string, string>;
  manifest: ProjectManifest;
  envPool: Record<string, string>;
  tag: string;
  instances: ModuleInstance[];
  deployment: Deployment;
}

// The env pool can be piped in (`<secrets pipeline> | zap arc deploy`) — the
// org-side tooling owns producing it; arc only routes. Piped input is the
// complete pool: no resolver, no public-file merge.
async function readStdinPool(): Promise<Record<string, string> | null> {
  if (process.stdin.isTTY) return null;

  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  raw = raw.trim();
  if (!raw) return null;
  return parseEnvText(raw);
}

async function prepare(opts: { stubEnv?: boolean } = {}): Promise<ArcContext> {
  const projectDir = process.cwd();
  const network = loadNetwork();
  const creds = loadCredentials();
  const manifest = loadManifest(projectDir);

  const instances = resolveModules(manifest, network.modulesDir, projectDir);
  requireModuleCredentials(instances, creds, credentialsPath());

  let envPool: Record<string, string>;

  if (opts.stubEnv) {
    const names = Object.values(manifest.deploy.services).flatMap((s) =>
      bareEnvKeys(s.env),
    );

    envPool = Object.fromEntries(names.map((n) => [n, ""]));
    console.log("env pool: stubbed (destroy)");
  } else {
    const stdinPool = await readStdinPool();
    const resolver = manifest.deploy["env-resolver"] ?? network.env.resolver;
    envPool =
      stdinPool ??
      resolveEnvPool(projectDir, resolver, network.env["public-file"]);

    console.log(
      `env pool: ${stdinPool ? "stdin (piped)" : `resolver (${resolver})`}`,
    );
  }

  const tag = imageTag(projectDir);

  console.log(
    `zap arc: project '${manifest.slug}' on network '${network.name}' (tag ${tag})`,
  );

  const deployment = renderDeployment({
    manifest,
    network,
    creds,
    envPool,
    imageTag: tag,
    instances,
  });

  console.log(`rendered terraform → ${deployment.dir}`);

  return {
    projectDir,
    network,
    creds,
    manifest,
    envPool,
    tag,
    instances,
    deployment,
  };
}

// init, then — when URL modules are in play — read their module.yaml from
// Terraform's module cache and re-render with what they declare (env
// injections, actions, hooks). Zap never implements module fetching.
function initAndDiscover(ctx: ArcContext): void {
  run("terraform", ["init", "-input=false"], { cwd: ctx.deployment.dir });

  if (!ctx.deployment.hasRemote) return;

  ctx.instances = discoverRemoteManifests(ctx.deployment.dir, ctx.instances);
  requireModuleCredentials(ctx.instances, ctx.creds, credentialsPath());

  ctx.deployment = renderDeployment({
    manifest: ctx.manifest,
    network: ctx.network,
    creds: ctx.creds,
    envPool: ctx.envPool,
    imageTag: ctx.tag,
    instances: ctx.instances,
    dir: ctx.deployment.dir,
  });

  run("terraform", ["init", "-input=false"], { cwd: ctx.deployment.dir });
}

function buildAndPushImages(ctx: ArcContext): void {
  for (const build of ctx.deployment.containerBuilds) {
    // Cloud container runtimes are amd64; the local machine may be arm64.
    run(
      "docker",
      [
        "build",
        "--platform",
        "linux/amd64",
        "-t",
        build.image,
        "-f",
        build.dockerfile,
        ".",
      ],
      { cwd: ctx.projectDir },
    );

    run("docker", ["push", build.image], { cwd: ctx.projectDir });
  }
}

function readOutputs(ctx: ArcContext): Record<string, string> {
  if (ctx.deployment.outputNames.length === 0) return {};

  const raw = JSON.parse(
    capture("terraform output -json", { cwd: ctx.deployment.dir }),
  ) as Record<string, { value: unknown }>;

  return Object.fromEntries(
    Object.entries(raw).map(([name, output]) => [name, String(output.value)]),
  );
}

function fail(error: unknown): never {
  console.error(`zap arc: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

export function createArcCommand(): Command {
  const arc = new Command("arc").description(
    "Deploy this zap project to the cloud from its deploy: block",
  );

  arc.option(
    "--config <file>",
    "arc operator config file (default ~/.config/zap-arc/config.yaml)",
  );

  arc.hook("preAction", () => {
    const config = arc.opts<{ config?: string }>().config;
    if (config) process.env.ZAP_ARC_CONFIG = config;
  });

  arc
    .command("plan")
    .description("Render Terraform from the deploy block and show the plan")
    .action(async () => {
      try {
        const ctx = await prepare();

        try {
          initAndDiscover(ctx);
          run("terraform", ["plan", "-input=false"], {
            cwd: ctx.deployment.dir,
          });
        } finally {
          rmSync(ctx.deployment.dir, { recursive: true, force: true });
        }
      } catch (error) {
        fail(error);
      }
    });

  arc
    .command("deploy")
    .description("Deploy: build images, apply Terraform, run module hooks")
    .option(
      "--keep",
      "keep the rendered Terraform dir on failure for debugging",
    )
    .action(async (opts: { keep?: boolean }) => {
      try {
        const ctx = await prepare();
        let failed = false;

        try {
          initAndDiscover(ctx);

          await runHooks("pre-apply", {
            projectDir: ctx.projectDir,
            creds: ctx.creds,
            deployment: ctx.deployment,
          });

          // Project-level modules (project factory, registry, …) must exist
          // before images push or services apply; idempotent and quick.
          if (ctx.deployment.projectTargets.length > 0) {
            run(
              "terraform",
              [
                "apply",
                ...ctx.deployment.projectTargets.map((t) => `-target=${t}`),
                "-auto-approve",
                "-input=false",
                "-lock-timeout=10m",
              ],
              { cwd: ctx.deployment.dir },
            );
          }

          buildAndPushImages(ctx);
          run(
            "terraform",
            ["apply", "-auto-approve", "-input=false", "-lock-timeout=10m"],
            {
              cwd: ctx.deployment.dir,
            },
          );

          await runHooks("post-apply", {
            projectDir: ctx.projectDir,
            creds: ctx.creds,
            deployment: ctx.deployment,
            outputs: readOutputs(ctx),
          });

          console.log("\nzap arc deploy complete:");

          for (const [service, url] of Object.entries(
            ctx.deployment.serviceUrls,
          )) {
            console.log(`  ${service}: ${url}`);
          }
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          if (failed && opts.keep) {
            console.error(`rendered terraform kept at ${ctx.deployment.dir}`);
          } else {
            rmSync(ctx.deployment.dir, { recursive: true, force: true });
          }
        }
      } catch (error) {
        fail(error);
      }
    });

  arc
    .command("destroy")
    .description(
      "Tear down everything Terraform manages for this project (including a deploy.project GCP project module, if present)",
    )
    .option("--yes", "skip terraform's confirmation prompt")
    .action(async (opts: { yes?: boolean }) => {
      try {
        const ctx = await prepare({ stubEnv: true });

        try {
          initAndDiscover(ctx);
          const args = ["destroy", "-input=false", "-lock-timeout=10m"];
          if (opts.yes) args.push("-auto-approve");
          run("terraform", args, { cwd: ctx.deployment.dir });

          console.log(
            `\nzap arc destroy complete for '${ctx.deployment.project}'.`,
          );
        } finally {
          rmSync(ctx.deployment.dir, { recursive: true, force: true });
        }
      } catch (error) {
        fail(error);
      }
    });

  arc
    .command("bootstrap")
    .description(
      "One-time network setup: network GCP project, state bucket, docker auth",
    )
    .action(() => {
      try {
        const network = loadNetwork();

        // Bootstrap is the one GCP-aware convenience left in the engine. It
        // reads the network's template vars — networks on other clouds simply
        // don't run it.
        const networkProject = network.vars["network-project"];
        const region = network.vars["region"];

        if (!networkProject || !region) {
          throw new Error(
            "Bootstrap needs 'network-project' and 'region' keys in the network config.",
          );
        }

        const bucket = network.backend?.gcs?.bucket;

        if (typeof bucket !== "string") {
          throw new Error(
            "Bootstrap supports the gcs backend only — set backend.gcs.bucket in the network config.",
          );
        }

        const adc = join(
          homedir(),
          ".config/gcloud/application_default_credentials.json",
        );

        if (!existsSync(adc)) {
          throw new Error(
            "No GCP application default credentials. Run: gcloud auth login && gcloud auth application-default login",
          );
        }

        try {
          capture(
            `gcloud projects describe ${networkProject} --format='value(projectId)'`,
          );

          console.log(`Network project ${networkProject} exists`);
        } catch {
          run("gcloud", [
            "projects",
            "create",
            networkProject,
            "--labels=arc-managed=true",
          ]);

          const billing =
            network.vars["billing-account"] ??
            capture(
              "gcloud billing accounts list --filter=open=true --format='value(name)' --limit=1",
            );

          if (!billing) {
            throw new Error(
              "No open billing account found; link billing manually.",
            );
          }

          run("gcloud", [
            "billing",
            "projects",
            "link",
            networkProject,
            `--billing-account=${billing}`,
          ]);
        }

        try {
          capture(
            `gcloud storage buckets describe gs://${bucket} --format='value(name)'`,
          );

          console.log(`State bucket gs://${bucket} exists`);
        } catch {
          run("gcloud", [
            "storage",
            "buckets",
            "create",
            `gs://${bucket}`,
            `--project=${networkProject}`,
            `--location=${region}`,
            "--uniform-bucket-level-access",
          ]);

          run("gcloud", [
            "storage",
            "buckets",
            "update",
            `gs://${bucket}`,
            "--versioning",
          ]);
        }

        if (network.registry) {
          const host = expandVars(
            network.registry,
            { ...network.vars, slug: "x", network: network.name },
            "network registry template",
          ).split("/")[0];

          run("gcloud", ["auth", "configure-docker", host, "--quiet"]);
        }

        run("gcloud", [
          "auth",
          "application-default",
          "set-quota-project",
          networkProject,
        ]);

        console.log("\nbootstrap complete");
      } catch (error) {
        fail(error);
      }
    });

  return arc;
}
