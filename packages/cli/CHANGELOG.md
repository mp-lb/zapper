# @mp-lb/zapper

## 0.21.3

### Patch Changes

- 66fe70e: Allow an explicit Cloud Run domain mapping transfer with `params.force-override` while keeping the default safe.

## 0.21.2

### Patch Changes

- 36b8960: Pin Cloud Run, Compute Engine, and Artifact Registry resources to the configured GCP project so Arc migrations replace resources in the previous project.

## 0.21.1

### Patch Changes

- bca6137: Expose Cloud Run CPU idle configuration in the Arc Terraform module so projects can set `cpu-idle` without Terraform rejecting the generated module input.
- 66cfd6c: Use one required stack-scoped runtime identity across Docker containers,
  Docker Compose grouping metadata, native processes, wrapper scripts, and logs.
  Legacy unscoped resources remain discoverable by global cleanup commands.
- 80d4212: Allow Cloud Run web services to opt into CPU idling through the bundled Arc module's `cpu_idle` variable.

  Tighten local runtime behavior by clearing managed native service logs when a new run starts, preserving stopped-service logs, showing Docker startup logs when a container never reached a running state, and rejecting configs that combine profiles with root-level env/env_files.

- Updated dependencies [66cfd6c]
- Updated dependencies [80d4212]
  - @mp-lb/zapper-sdk@0.20.1

## 0.21.0

### Minor Changes

- 86748c1: New bundled arc module `aws-s3`: a private, versioned S3 bucket plus an IAM
  user scoped to that bucket only, injecting `AWS_S3_BUCKET`, `AWS_REGION`,
  `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` into sibling container
  services. AWS auth comes from the network's provider config
  (`{{cred.AWS_*}}`) or ambient AWS configuration.

  Arc env precedence fix: module env injections now fill gaps only — a
  service's own `env:` entry (whitelist or literal) wins on conflict, so a
  project can adopt a binding module without its injected values overriding
  explicitly declared env.

- bd05685: Zap Arc engine is now provider-agnostic: all GCP/Atlas/Vercel knowledge moved
  out of the engine into module data (`module.yaml` manifests with hooks,
  defaults, credentials, and env injections) and generic network config
  (`backend:`, `providers:`, `module-defaults:`, `registry:`, template
  variables). Modules resolve from the bundled library, remote URLs, or
  `./relative` paths; GCP projects are Terraform-managed via a new
  `deploy.project:` section; `env:` is one list (bare `KEY` whitelists from the
  pool, `KEY=value` is a literal) replacing `env-values`. Existing network.yaml
  and deploy blocks need migrating to the new shape. Remote-build Vercel
  services deploy via pull/build/`--prebuilt` from the module hook.

  `zap profile select`/`reset` now hot-swap the running stack: the new
  profile's services are started, shared services are left alone, and Zapper
  prompts (skippable with `--force`, `-y`) before stopping services the new
  profile no longer needs.

## 0.20.0

### Minor Changes

- Add local runtime host path support and delegate running service logs to the
  underlying runtime log command.

## 0.19.0

### Minor Changes

- 9bd9b7d: Accept kebab-case config keys in `zap.yaml`. Multi-word keys (`env-files`,
  `init-task`, `git-method`, `task-delimiters`, `depends-on`, `internal-dir`,
  `read-only`) may now be written in kebab-case as well as snake_case; both are
  normalized to the canonical form before validation. User-chosen names
  (processes, containers, tasks, volumes, secrets, profiles) are never rewritten.

## 0.18.1

### Patch Changes

- Support Docker command overrides as either friendly strings or exact argument arrays, and add best-effort CLI command analytics.

## 0.18.0

### Minor Changes

- Make readiness waits explicit: services without a healthcheck now report as up immediately, dependency waves only wait for dependencies with healthchecks, profiles include transitive dependencies automatically, and healthcheck config now supports explicit delay and HTTP objects with polling controls.

## 0.17.0

### Minor Changes

- Add bundled runtime command resolution for PM2 and host tools, improve cross-platform launch/open behavior, and update release/deploy workflows.

## 0.16.1

### Patch Changes

- Fix profile reset CLI output and type-only exports for release builds.

## 0.16.0

### Minor Changes

- f379113: Add project open targets, structured action result reporting, JSON validation output, and stale registry pruning support.
