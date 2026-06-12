# Zap Arc

Zap Arc deploys a zap project to the cloud from a top-level `deploy:` block in
`zap.yaml`. It is opt-in: projects without a `deploy:` block are unaffected,
and zapper-core strips the key at its parse boundary (see
[Configuration → Reserved External Keys](./configuration.md)) — the arc
subsystem owns that schema and reads `zap.yaml` itself.

Arc is Zapper's Terraform integration: manifest in, Terraform + lifecycle out.
The engine is provider-agnostic — all GCP/Vercel/Atlas/… knowledge lives in
data (the network config and the module library), never in engine code. The
only built-in provider actions are docker build/push (`action: container`)
and the gcloud `bootstrap` convenience.

## Commands

- `zap arc plan` — render Terraform from the deploy block and show the plan.
- `zap arc deploy` — run pre-apply hooks, apply project-level modules, build
  and push images, apply Terraform against central state, run post-apply
  hooks. `--keep` retains the rendered Terraform on failure.
- `zap arc destroy` — terraform destroy of everything in state. If the
  deploy block includes a `gcp-project` module, this deletes the project's
  GCP project too (30-day recovery window).
- `zap arc bootstrap` — one-time network setup (network GCP project, state
  bucket, docker auth). The one GCP-aware convenience left in the engine; it
  needs `network-project` and `region` template vars and a `gcs` backend in
  the network config.

## Configuration layers

1. **Project** — the `deploy:` block (see below).
2. **Network** — a `network.yaml` (backend, providers, registry template,
   module defaults, DNS zone, env resolver). Located via the operator config.
   See [arc-network.example.yaml](./arc-network.example.yaml).
3. **Operator** — `~/.config/zap-arc/config.yaml`, a pointer (`network:` +
   `credentials:` paths). Override with `zap arc --config` or `ZAP_ARC_CONFIG`.
   GCP auth is gcloud ADC; provider tokens live in the credentials dotenv.

## The deploy block

```yaml
deploy:
  project:            # project-level modules: same mechanics, no service semantics
    gcp:
      module: gcp-project
    registry:
      module: project-base
      depends-on: [gcp]
  services:
    backend:
      module: cloud-run-web
      domain: api.example.com
      params:               # module parameters — passed through to Terraform
        port: 8080
        min-instances: 1
      env:
        - SOME_SECRET                     # bare KEY: whitelisted from the pool
        - PUBLIC_URL=https://example.com  # KEY=value: committed literal
```

**`params:` is pure pass-through.** Everything under it flows to the module's
Terraform variables verbatim (kebab→snake on the key) and to hook templates
as `{{params.*}}`. The manifest *is* the module's `variables.tf`: unknown
params fail at terraform plan. The keys outside `params:` (`module`,
`domain`, `dns-zone`, `env`, `dockerfile`, `build`, `deploy-path`,
`remote-build`, `local-config`, `vercel-name`, `depends-on`) are arc's own
vocabulary — anything else top-level is a validation error
("argument not expected"), defaults live in the module. Reserved structural
keys are arc's: `module`, `domain`, `env`, `dockerfile`, `build`,
`deploy-path`, `remote-build`, `local-config`, `vercel-name`, `depends-on`.
Hooks can still read them as `{{params.*}}`.

Setting `domain` passes `domain` and `dns_zone` (the network's zone name) to
the module — each module does its own zone lookup.

Param merge order: module `variables.tf` defaults < module.yaml `defaults:` <
network `module-defaults:` < deploy block.

`deploy.project` entries are modules without service semantics (no env map,
no container action, no URL) — project factories, registries, budgets, DNS.
`depends-on: [<entry key>]` orders them; arc applies all project modules
(targeted) before images push and services apply.

## Module resolution, three ways

- **Bare slug** (`cloud-run-web`) — the module library. Bundled with the zap
  package (`packages/cli/arc/`); a network config can override the location
  with `modules:`.
- **Full URL / Terraform source** (`github.com/org/repo//mod?ref=v1`) —
  passed through as the Terraform module source; Terraform fetches, caches
  and pins. Arc reads the module.yaml from `.terraform/modules/` after init —
  remote modules never mean remote code execution beyond their declared hook
  commands.
- **`./relative`** — resolved against the project dir: the raw-Terraform
  escape hatch and one-off plugins.

A bare Terraform folder is a valid module; `module.yaml` is optional.

## Bundled module library

- `cloud-run-web` — public HTTP container service on Cloud Run, custom domain
  via Cloud Run domain mapping + Cloudflare DNS.
- `gce-worker` — always-on container worker on a small GCE VM.
- `vercel-static` — Vercel-hosted static frontend with custom domain; upload
  runs as a post-apply hook.
- `gcp-project` — project factory: the per-project GCP project (billing,
  APIs); destroying it deletes the GCP project.
- `project-base` — per-project base resources (the Docker artifact registry).
- `gcp-budget` — monthly billing budget with spend alerts.
- `posthog-proxy` — proxied CNAME for PostHog's managed reverse proxy.
- `shared-mongo-atlas` — binding: scoped user + database on the network's
  shared Atlas cluster; injects `MONGODB_URL`.
- `upstash-redis` — one Upstash Redis database for the project; injects
  `REDIS_URL`.
- `aws-s3` — private, versioned S3 bucket + an IAM user scoped to that bucket
  only; injects `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`. AWS auth via the network's provider config
  (`{{cred.AWS_*}}`) or ambient AWS configuration.

## module.yaml

Only what Terraform can't declare:

```yaml
action: container        # docker build/push; arc passes image + env variables
defaults:                # default params; {slug}/{service}/{network} templates
  name: "{slug}-{service}"
credentials:             # operator credentials, checked early
  - name: VERCEL_API_TOKEN
    why: create the Vercel project and upload deploys
env:                     # injected into every sibling container service
  REDIS_URL: "{{output.redis_url}}"
hooks:
  pre-apply: []
  post-apply:
    - name: upload
      env:
        VERCEL_PROJECT_ID: "{{output.project_id}}"
      run: |
        npx -y vercel deploy …
```

- `action: container` — arc docker-builds (`dockerfile:`, default
  `Dockerfile`) and pushes `<registry>/<service>:<git-sha>`, passing `image`
  and the resolved `env` map as Terraform variables.
- `env:` values may use `{{output.NAME}}` (a Terraform reference to this
  module's output), `{{cred.NAME}}`, `{{params.key}}`.
- Hooks run `run:` shell commands (or `task: <zap task>` — the project's own
  zap task, with the deploy env injected and the local dev env suppressed)
  from the project dir, with the service's deploy env, the module's declared
  credentials, and `ARC_SERVICE_ENV` (the env map as JSON) in the process
  env. `{{output.*}}` is post-apply only. Credential values are masked in
  anything arc prints.

## Env

Service env is one `env:` list — bare names whitelisted from a pool, literals
committed inline. The pool is piped in (`<your secrets tooling> | zap arc
deploy`, JSON or dotenv on stdin) or comes from the network's fallback
resolver command. Binding modules (shared databases, redis, buckets) inject
their env vars via module.yaml — injections need no declaring, and they fill
gaps only: a service's own env entry (whitelist or literal) wins on conflict,
so divergence stays declared in the deploy block.

## Network config

`backend:` and `providers:` are passthrough maps rendered straight into the
Terraform backend/provider blocks. Provider configs may use `{{cred.NAME}}`;
any string may use `{var}` template variables — `{slug}`, `{network}`, plus
every extra top-level string key the network config defines (e.g. `region`,
`gcp-project: mp-lb-{slug}`). `registry:` is the image template arc appends
`/<service>:<tag>` to. `module-defaults:` feeds network facts (regions,
billing accounts, cluster hosts) to modules without touching project files.
