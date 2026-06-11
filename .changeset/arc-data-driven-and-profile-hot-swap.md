---
"@mp-lb/zapper": minor
---

Zap Arc engine is now provider-agnostic: all GCP/Atlas/Vercel knowledge moved
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
