# Zapper

Infrastructure as code for your local development environment.

## Why Zapper?

**One file, entire stack.** Define processes, containers, environment variables, and tasks in a single `zap.yaml`. No more scattered terminal tabs, docker-compose files, Makefiles, and `.env` files across repos.

**Zero mental overhead.** Coming back to a project after months? `zap up` and you're running. No remembering which services to start, what ports they use, or where the logs are.

**Resource-friendly.** Spin up and tear down entire multi-service projects instantly. On a MacBook juggling multiple projects, this matters.

**Detached logs.** Native services run through Zapper's own supervisor, so logs persist even if your terminal or editor crashes. Attach when you need them, detach when you don't. No dedicated terminal windows to babysit. This is much friendlier for AI agents too.

**Editor integration.** The Cursor/VSCode extension lets you start/stop services and view logs without leaving your editor.

**Secure env vars.** Centralize environment variables and whitelist which services see what. Secrets stay out of services that don't need them.

## Documentation

- **[Docs](docs/index.md)** — Quick start, user reference, and maintainer docs
- **[Commands](docs/commands.md)** — CLI command reference
- **[Configuration](docs/configuration.md)** — `zap.yaml` field reference
- **[CLI Development](docs/cli-development.md)** — CLI contributing, testing, and release workflow

## Repository Layout

- `packages/cli` — published CLI package (`@mp-lb/zapper`)
- `apps/landing-page` — Next.js landing page
- `docs` — VitePress documentation site and raw agent docs bundle
- `infra` — Terraform-managed deployment resources for the landing page

## Tool versions

Use the exact Node version in `.node-version` and the pnpm version in
`package.json#packageManager`. `engines.node` declares the minimum supported
Node version; it is not a development pin. CI reads `.node-version`.

With mise installed, run `mise trust`, then `mise install`. Use an activated
mise shell or `mise exec -- <command>` so Zapper inherits these tools.
For nvm, run `nvm install "$(cat .node-version)"` and
`nvm use "$(cat .node-version)"`. Dependency policy lives in
`pnpm-workspace.yaml`; use `workspace:*` for internal dependencies.
Zapper retains `save-exact=true` in `.npmrc` because its pinned pnpm 10.0.0
does not read that setting from workspace YAML. Move it to `saveExact: true`
and remove `.npmrc` when pnpm is upgraded to a version supporting that setting.

## Release reports

Release scripts print their package/version report to the console. CI passes
that report through the publisher step’s `release_report` output to verification
via `FSSSTACK_RELEASE_RESULT`; no release-result file is created in the checkout.
