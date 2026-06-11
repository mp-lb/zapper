import { Command } from "commander";
import { execSync, spawnSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadManifest } from "./manifest";
import { loadNetwork } from "./network";
import { loadCredentials, requireCredential } from "./creds";
import { resolveEnvPool, parseEnvText } from "./env";
import { renderDeployment, Deployment } from "./render";
import { NetworkConfig } from "./schemas";

// Zap Arc: deploy a zap project to the cloud from its `deploy:` block.
// Self-contained command group — needs no Zapper runtime context, and reads
// zap.yaml itself (zapper-core strips the deploy key at its parse boundary;
// arc owns that schema).

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): void {
  const shown = args.map((a) => a.replace(/(--token=)\S+/, "$1***"));

  console.log(`\n> ${cmd} ${shown.join(" ")}`);

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
  deployment: Deployment;
  envPool: Record<string, string>;
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

  let envPool: Record<string, string>;

  if (opts.stubEnv) {
    const names = Object.values(manifest.deploy.services).flatMap((s) => s.env);
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
  });

  console.log(`rendered terraform → ${deployment.dir}`);
  return { projectDir, network, creds, deployment, envPool };
}

function terraformInit(ctx: ArcContext): void {
  run("terraform", ["init", "-input=false"], { cwd: ctx.deployment.dir });
}

function buildAndPushImages(ctx: ArcContext): void {
  for (const build of ctx.deployment.containerBuilds) {
    // Cloud Run / GCE run amd64; the local machine may be arm64.
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

function vercelOrgId(token: string): string {
  const out = capture(
    `curl -fsS -H "Authorization: Bearer ${token}" https://api.vercel.com/v2/user`,
  );

  return JSON.parse(out).user.id;
}

function deployVercel(ctx: ArcContext): void {
  if (ctx.deployment.vercelDeploys.length === 0) return;

  const token = requireCredential(
    ctx.creds,
    "VERCEL_API_TOKEN",
    "Vercel deploys",
  );

  const orgId = vercelOrgId(token);

  const outputs = JSON.parse(
    capture("terraform output -json", { cwd: ctx.deployment.dir }),
  ) as Record<string, { value: string }>;

  for (const vd of ctx.deployment.vercelDeploys) {
    if (vd.build) {
      run("bash", ["-c", vd.build], { cwd: ctx.projectDir, env: vd.env });
    }

    const vercelEnv = {
      VERCEL_PROJECT_ID: outputs[vd.outputName].value,
      VERCEL_ORG_ID: orgId,
    };

    if (vd.remoteBuild) {
      // Framework projects: build locally via Vercel's CLI and upload only
      // the build output. Uploading the whole monorepo for a remote build
      // overwhelms Vercel's files API.
      run(
        "npx",
        [
          "-y",
          "vercel",
          "pull",
          "--yes",
          "--environment=production",
          `--token=${token}`,
        ],
        {
          cwd: ctx.projectDir,
          env: vercelEnv,
        },
      );

      run("npx", ["-y", "vercel", "build", "--prod", `--token=${token}`], {
        cwd: ctx.projectDir,
        env: { ...vercelEnv, ...vd.env },
      });

      run(
        "npx",
        [
          "-y",
          "vercel",
          "deploy",
          "--prebuilt",
          "--prod",
          "--yes",
          `--token=${token}`,
        ],
        {
          cwd: ctx.projectDir,
          env: vercelEnv,
        },
      );

      continue;
    }

    const args = ["-y", "vercel", "deploy"];
    if (vd.deployPath !== ".") args.push(vd.deployPath);
    args.push("--prod", "--yes", `--token=${token}`);
    if (vd.localConfig) args.push("--local-config", vd.localConfig);

    run("npx", args, { cwd: ctx.projectDir, env: vercelEnv });
  }
}

function resetWorkers(ctx: ArcContext): void {
  for (const worker of ctx.deployment.workers) {
    run("gcloud", [
      "compute",
      "instances",
      "reset",
      worker.instanceName,
      `--zone=${ctx.network.gcp.region}-a`,
      `--project=${ctx.deployment.gcpProject}`,
      "--quiet",
    ]);
  }
}

const PROJECT_APIS = [
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "compute.googleapis.com",
  "cloudresourcemanager.googleapis.com",
];

// One GCP project per code project, created on first deploy. Existing
// projects are assumed configured (describe succeeds → skip).
function ensureGcpProject(network: NetworkConfig, gcpProject: string): void {
  try {
    capture(
      `gcloud projects describe ${gcpProject} --format='value(projectId)'`,
    );

    return;
  } catch {
    console.log(`GCP project ${gcpProject} does not exist — creating`);
  }

  run("gcloud", [
    "projects",
    "create",
    gcpProject,
    "--labels=arc-managed=true",
  ]);

  const billing =
    network.gcp["billing-account"] ??
    capture(
      "gcloud billing accounts list --filter=open=true --format='value(name)' --limit=1",
    );

  if (!billing)
    throw new Error("No open billing account found; link billing manually.");
  run("gcloud", [
    "billing",
    "projects",
    "link",
    gcpProject,
    `--billing-account=${billing}`,
  ]);

  run("gcloud", [
    "services",
    "enable",
    ...PROJECT_APIS,
    `--project=${gcpProject}`,
  ]);
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
          terraformInit(ctx);
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
    .description("Deploy: build images, apply Terraform, upload frontends")
    .option(
      "--keep",
      "keep the rendered Terraform dir on failure for debugging",
    )
    .action(async (opts: { keep?: boolean }) => {
      try {
        const ctx = await prepare();
        let failed = false;

        try {
          ensureGcpProject(ctx.network, ctx.deployment.gcpProject);
          terraformInit(ctx);
          // Registry must exist before images push; idempotent and quick.
          run(
            "terraform",
            ["apply", "-target=module.base", "-auto-approve", "-input=false"],
            {
              cwd: ctx.deployment.dir,
            },
          );

          buildAndPushImages(ctx);
          run(
            "terraform",
            ["apply", "-auto-approve", "-input=false", "-lock-timeout=10m"],
            {
              cwd: ctx.deployment.dir,
            },
          );

          deployVercel(ctx);
          resetWorkers(ctx);

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
      "Tear down: terraform destroy, optionally delete the GCP project",
    )
    .option("--yes", "skip terraform's confirmation prompt")
    .option(
      "--delete-gcp-project",
      "after destroy, delete the project's GCP project entirely",
    )
    .action(async (opts: { yes?: boolean; deleteGcpProject?: boolean }) => {
      try {
        const ctx = await prepare({ stubEnv: true });

        try {
          terraformInit(ctx);
          const args = ["destroy", "-input=false", "-lock-timeout=10m"];
          if (opts.yes) args.push("-auto-approve");
          run("terraform", args, { cwd: ctx.deployment.dir });

          if (opts.deleteGcpProject) {
            run("gcloud", [
              "projects",
              "delete",
              ctx.deployment.gcpProject,
              "--quiet",
            ]);

            console.log(
              `GCP project ${ctx.deployment.gcpProject} scheduled for deletion (30-day recovery window).`,
            );
          }

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
        const { region } = network.gcp;
        const networkProject = network.gcp["network-project"];
        const bucket = network.gcp["state-bucket"];

        const adc = join(
          homedir(),
          ".config/gcloud/application_default_credentials.json",
        );

        if (!existsSync(adc)) {
          throw new Error(
            "No GCP application default credentials. Run: gcloud auth login && gcloud auth application-default login",
          );
        }

        ensureGcpProject(network, networkProject);

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

        run("gcloud", [
          "auth",
          "configure-docker",
          `${region}-docker.pkg.dev`,
          "--quiet",
        ]);

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
