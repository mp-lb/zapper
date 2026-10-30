# Local Development

Guide for contributing to zapper.

## Repository Layout

Zapper is a pnpm workspace:

- `packages/cli` contains the published CLI package, source, unit tests, e2e tests, examples, and CLI-specific tooling.
- `apps/landing-page` contains the Next.js landing page.
- `apps/docs` contains the Fumadocs documentation site. Its MDX files under `content/docs` are the public source of truth.
- `.arcnet/arcnet.yaml` contains the project-specific production site and release configuration.

## Prerequisites

- Node.js 18+
- pnpm
- Docker (for testing docker services)

## Getting Started

```bash
npm uninstall --global zapper-cli @maplab/zapper @mp-lb/zapper  # Start fresh
pnpm remove --global zapper-cli @maplab/zapper @mp-lb/zapper     # Remove stale pnpm links
pnpm add --global @mp-lb/zapper  # Make sure it's installed with pnpm
pnpm install
pnpm build
pnpm add --global "link:$(pwd)/packages/cli" --config.ignore-scripts=true
```

After linking, your global `zap` command points to the local CLI package build. Make changes, run `pnpm build`, and test immediately.

Before publishing, run `pnpm build`. The package publish hook checks the built output and does not rebuild it, so concurrent workspace publication cannot race over generated files.

If pnpm says its global bin directory is not on your `PATH`, run `pnpm setup`
once and restart your shell before retrying the global commands.

## Linking & Unlinking

```bash
which zap                 # Should show pnpm global path
ls -la $(which zap)       # Should symlink to packages/cli/dist/index.js
sed -n '1,80p' $(which zap)  # Should execute this checkout's packages/cli/dist/index.js
pnpm list -g --depth 0    # Should show @mp-lb/zapper link:<this checkout>/packages/cli

# Unlink when done
pnpm remove --global @mp-lb/zapper
npm install --global @mp-lb/zapper  # Reinstall from npm
```

If `zap` still points at an old checkout, remove the stale global package name
and link again:

```bash
pnpm remove --global zapper-cli @maplab/zapper @mp-lb/zapper
pnpm build
pnpm add --global "link:$(pwd)/packages/cli" --config.ignore-scripts=true
```

## Testing

```bash
pnpm test                        # Run CLI unit tests
pnpm test:watch                  # CLI unit test watch mode
pnpm --filter @mp-lb/zapper test yaml-parser.test.ts    # Specific CLI test file
pnpm test:e2e                    # E2E in isolated Linux VM (macOS + Lima)
pnpm dev:renderer                # Renderer vibe sheet (local development preview)
pnpm dev:landing                 # Landing page dev server
pnpm dev:docs                    # Fumadocs development server
pnpm docs:build                  # Build the docs site and generated raw docs
```

For manual CLI testing, use the example projects in `packages/cli/examples/`. After building, cd into one and run `zap up`.

## CLI Analytics

The CLI sends one best-effort product analytics event, `command.run`, when a
top-level command handler is invoked. Events use the shared event shape: the
PostHog event name is `command.run`, `source.platform` is `cli`, and command
breakdowns live in `details` as space-separated CLI names such as
`command_l1: "profile"` and `command_l2: "profile use"`.

The PostHog project token is public product analytics configuration. Put it in
`.arcnet/arcnet.yaml` as `variables.NEXT_PUBLIC_POSTHOG_KEY`; `NEXT_PUBLIC_POSTHOG_HOST` is optional
and defaults to `https://us.i.posthog.com`. `pnpm build` injects those values
into the compiled CLI package. Runtime `POSTHOG_KEY` and `POSTHOG_HOST`
environment variables override the injected values for local testing.

Analytics is intentionally silent and best-effort. Missing config, offline
network, request timeouts, and PostHog errors do not print output or affect
command exit behavior. Set `ZAPPER_ANALYTICS_DISABLED=1` or `DO_NOT_TRACK=1`
to disable capture for a process.

## Documentation Site

The docs website is a Fumadocs workspace package in `apps/docs`. Edit the MDX files in `apps/docs/content/docs/`. Its React Router build serves the site and agent-readable docs from the same source.

```bash
pnpm dev:docs
pnpm docs:build
pnpm docs:start
```

`pnpm build` runs the docs build through Turbo. The generated client output lives in `apps/docs/build/client`, and the site serves `/llms.txt` and `/llms-full.txt`.

### E2E in Linux VM (macOS)

```bash
bash ./packages/cli/etc/e2e_setup.sh          # One-time: install Lima + provision base VM
pnpm test:e2e                    # Each run clones an isolated throwaway VM
```

Notes:

- `pnpm test:e2e` runs in an ephemeral cloned VM and auto-deletes it on exit.
- Base VM name defaults to `zapper-e2e-base` (override with `ZAP_E2E_BASE_VM_NAME`).
- Keep a failed run VM for debugging: `ZAP_E2E_KEEP_VM=1 pnpm test:e2e`.
- By default, `pnpm test:e2e` is strict and fails if VM setup is missing.

## Web Deployment

ArcNet deploys the landing page and docs site through
[`.github/workflows/deploy-arc.yaml`](../../.github/workflows/deploy-arc.yaml).
Their Vercel projects, domains, roots, public build variables, and selected
secrets are declared in [`.arcnet/arcnet.yaml`](../../.arcnet/arcnet.yaml).
Update that file, run `arcnet check`, and push to `main` to deploy.

## Release CI Auth

[`.github/workflows/publish.yaml`](../../.github/workflows/publish.yaml)
loads the `publish` consumer from ArcNet. The standard encrypted source
provides `NPM_TOKEN`; its snapshot lives under `.arcnet/secrets/`. After a
Forum secrets edit, run `arcnet secrets sync` and commit the refreshed encrypted
snapshot.
