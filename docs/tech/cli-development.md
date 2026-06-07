# Local Development

Guide for contributing to zapper.

## Repository Layout

Zapper is a pnpm workspace:

- `packages/cli` contains the published CLI package, source, unit tests, e2e tests, examples, and CLI-specific tooling.
- `apps/landing-page` contains the Next.js landing page.
- `docs` contains the VitePress documentation site. Its Markdown files remain the source of truth, and `pnpm --filter @mp-lb/zapper-docs raw` generates `llms.txt` and `llms-full.txt` for agents and automation.
- `infra` contains Terraform-managed deployment resources for the landing page.

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
pnpm dev:docs                    # VitePress docs dev server on 127.0.0.1:4315
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
the repo root `.env.production` as `POSTHOG_KEY`; `POSTHOG_HOST` is optional
and defaults to `https://us.i.posthog.com`. `pnpm build` injects those values
into the compiled CLI package. Runtime `POSTHOG_KEY` and `POSTHOG_HOST`
environment variables override the injected values for local testing.

Analytics is intentionally silent and best-effort. Missing config, offline
network, request timeouts, and PostHog errors do not print output or affect
command exit behavior. Set `ZAPPER_ANALYTICS_DISABLED=1` or `DO_NOT_TRACK=1`
to disable capture for a process.

## macOS Menu Bar App

The native macOS app lives in `apps/macos`. It is a lightweight SwiftUI
dashboard hosted by an AppKit menu bar status item. It shells out to the
bundled `zap` CLI runtime for reads and actions: `zap system projects --json`,
`zap home --json`, and `zap up`/`zap down`/`zap restart` for instances or
individual services.
It does not parse `.zap` state or `zap.yaml` directly.

The first version does not require opening Xcode. Build and run it with:

```bash
apps/macos/bin/build
apps/macos/bin/run
apps/macos/bin/clean
```

For the short local rebuild/restart loop, see
[macOS Development](macos-development.md).

The build script uses `swiftc` and writes `apps/macos/build/Zapper.app`. By
default it also packages a local Node runtime, the built CLI, production CLI
dependencies, and PM2 under `Contents/Resources/ZapperRuntime`. Run
`pnpm --filter @mp-lb/zapper build` before `apps/macos/bin/build`. Set
`PACKAGE_ZAPPER_RUNTIME=0` to skip runtime packaging for local Swift-only
development.

Release builds prefer the bundled `zap` wrapper so Finder-launched app sessions
do not require a globally available `node`. `ZAPPER_CLI_PATH` and the in-app CLI
picker in Settings remain available for development and diagnostics. The main
dashboard lists stacks, where each stack is one project instance. Default
instances show as the project name; non-default instances append the instance
key in parentheses. If multiple stacks would render with the same name, the row
also includes the instance label and random instance ID, falling back to just the
ID when no label is set. Stack rows show running-service summaries with a small
status LED and high-value actions. Expanded stack rows include project path and
instance identity. Pinning lives in the stack overflow menu.
The Open control is hidden when no homepage or project links are configured,
opens directly when there is one target, and becomes a menu when there are
multiple targets. Pinned stacks are stored in local app preferences and appear
in a Pinned section above unpinned stacks.
Missing registry entries appear as one compact, expandable warning with a Prune
button. Clicking Prune replaces the warning with an inline destructive
confirmation; accepting runs `zap global prune`.
The menu bar status item stays compact: it shows the bolt icon and the running
service count, without status words.
Unpinned stacks are grouped into Active and Inactive sections using the same
state as the stack LED: running, pending, or errored stacks are active; gray LED
stacks are inactive. Expanded stack details group services by native and Docker
runtime. Service start, stop, and restart controls live in each service overflow
menu, and actions show immediate stale-state feedback in the stack and service
rows before converging on the next real CLI refresh. Amber LEDs are reserved for
real CLI-reported pending state; the spinner means the app knows the displayed
state is stale. The open popover polls briefly at a faster cadence, settles to a
slower idle cadence, polls at least every 8 seconds while closed, and polls more
frequently while action state is stale.
During refresh, the header keeps showing the last service summary and uses a
fixed-size spinner/check indicator to avoid layout shifts. Paths, runtime
metadata, last update time, last action, CLI override controls, refresh, and
quit are tucked into info menus or the gear menu. The popover uses native macOS
material and resizes to content up to a capped height before scrolling.

GitHub Actions builds release assets through `.github/workflows/macos-release.yml`.
The workflow runs on `v*` tags or manual dispatch, installs Node and pnpm,
builds the CLI, builds the signed app with the bundled runtime, zips
`Zapper.app`, and attaches both `Zapper-<tag>-macOS.zip` and the stable
`Zapper-macOS.zip` asset to the matching GitHub Release.

Local app builds are ad-hoc signed unless `CODESIGN_IDENTITY` is set. Release
builds load `CSC_LINK`, `APPLE_ID`, and `APPLE_TEAM_ID` from `.env.production`,
decrypt `docs/secrets.txt.enc` with the GitHub Actions `SECRETS_KEY` secret,
load `CSC_KEY_PASSWORD` and `APPLE_APP_SPECIFIC_PASSWORD`, and then sign with
the hardened runtime before notarizing and packaging.
The build signs nested runtime binaries with
`apps/macos/Signing/Zapper.entitlements` so the bundled Node/V8 runtime can run
under the hardened runtime.

## Documentation Site

The docs website is a VitePress workspace package in `docs`. Keep editing the Markdown files in `docs/`; VitePress turns them into the website, and the raw docs generator publishes agent-friendly files from the same source.

```bash
pnpm dev:docs
pnpm docs:build
pnpm docs:preview
```

`pnpm build` runs the docs build through Turbo. The generated site lives in `docs/.vitepress/dist`, and the published raw files are available at `/llms.txt` and `/llms-full.txt` in the built site.

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

The landing page lives in `apps/landing-page`, and the docs site lives in `docs`. Both are deployed by `.github/workflows/deploy-web.yml`.

Deployment resources are managed through Terraform in `infra`. Terraform creates separate Vercel projects for the landing page and docs site, plus Cloudflare DNS records for `zapper.mp-lb.dev` and `docs.zapper.mp-lb.dev` by default.

The landing page deploy is built from the repo's root pnpm workspace metadata.
Keep the root `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` as
the deploy source of truth, and do not commit a separate
`apps/landing-page/package-lock.json`. A stray npm lockfile in the app
directory can cause Vercel to detect the wrong package manager for that project.

```bash
cd infra
terraform init -backend-config="bucket=<gcp-project-id>-terraform-state" -backend-config="prefix=terraform/state/zapper"
terraform apply \
  -var="project_name=zapper" \
  -var="vercel_api_token=$VERCEL_API_TOKEN" \
  -var="cloudflare_api_token=$CLOUDFLARE_API_TOKEN"
```

The workflow provisions the Vercel projects/domains through Terraform, builds `@mp-lb/zapper-landing-page` and `@mp-lb/zapper-docs` for verification, deploys the landing page from the repo root using Vercel's prebuilt output, then deploys the docs site from the `docs` workspace directory.
The landing page `/download/mac` route redirects to the latest macOS GitHub
Release zip. Add `GCP_SA_KEY`, `VERCEL_API_TOKEN`, `CLOUDFLARE_API_TOKEN`,
optional `VERCEL_ORG_ID`, and optional `DESKTOP_RELEASES_GITHUB_TOKEN` to
`docs/secrets.txt.enc`; GitHub Actions decrypts it with `SECRETS_KEY`.
`GCP_PROJECT_ID` is derived from the service account JSON when it is not
provided separately. Terraform resolves the active Cloudflare zone from
`domain`. Terraform passes the desktop releases token into the Vercel project
runtime environment when present.

## Release CI Auth

Release publishing runs through `.github/workflows/release.yml`.

- The workflow decrypts `docs/secrets.txt.enc` with the repository
  `SECRETS_KEY` GitHub Actions secret.
- `docs/secrets.txt.enc` must contain `NPM_TOKEN` with publish access to
  `@mp-lb/zapper`.
- If release CI fails with auth or 2FA errors, confirm `NPM_TOKEN` exists in
  the encrypted secrets file and belongs to an npm identity with publish rights
  for the `@mp-lb` scope.
