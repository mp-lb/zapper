# Zap Arc

Zap Arc deploys a zap project to the cloud from a top-level `deploy:` block in
`zap.yaml`. It is opt-in: projects without a `deploy:` block are unaffected,
and zapper-core strips the key at its parse boundary (see
[Configuration → Reserved External Keys](./configuration.md)) — the arc
subsystem owns that schema and reads `zap.yaml` itself.

## Commands

- `zap arc plan` — render Terraform from the deploy block and show the plan.
- `zap arc deploy` — build/push images, apply Terraform against central
  state, upload frontends. `--keep` retains the rendered Terraform on failure.
- `zap arc destroy` — terraform destroy; `--delete-gcp-project` also deletes
  the project's GCP project.
- `zap arc bootstrap` — one-time network setup (network GCP project, state
  bucket, docker auth).

## Configuration layers

1. **Project** — the `deploy:` block: services referencing zap process names,
   each naming a deploy module plus params (domain, env whitelist,
   env-values…).
2. **Network** — a `network.yaml` (GCP layout, DNS zone, state bucket, module
   library path, env resolver). Located via the operator config.
3. **Operator** — `~/.config/zap-arc/config.yaml`, a pointer (`network:` +
   `credentials:` paths). Override with `zap arc --config` or `ZAP_ARC_CONFIG`.
   GCP auth is gcloud ADC; provider tokens live in the credentials dotenv.

## Env

Service env is a whitelist of names; values arrive as a pool — piped in
(`<your secrets tooling> | zap arc deploy`, JSON or dotenv on stdin) or from
the network's fallback resolver command. Binding modules (shared databases,
redis) inject their env vars on top.

## Modules

Deploy modules are plain Terraform folders. The built-in library ships with
the zap package (`packages/cli/arc/`); a network config can override the
location with `modules:` (a local path today; git URLs planned). Zap Arc
renders a root module per project into a temp dir at deploy time; nothing is
committed to the project.
