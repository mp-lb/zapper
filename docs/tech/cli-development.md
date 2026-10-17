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
default it also packages a local Node runtime, the built CLI, the built SDK,
and production runtime dependencies under `Contents/Resources/ZapperRuntime`.
Run `pnpm build` before `apps/macos/bin/build`. Set
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

GitHub Actions builds release assets through `.github/workflows/release-macos.yaml`.
The workflow runs on `v*` tags or manual dispatch, installs Node and pnpm,
builds the CLI, builds the signed app with the bundled runtime, zips
`Zapper.app`, and attaches both `Zapper-<tag>-macOS.zip` and the stable
`Zapper-macOS.zip` asset to the matching GitHub Release.

Local app builds are ad-hoc signed unless `CODESIGN_IDENTITY` is set. Release
builds load `APPLE_ID` and `APPLE_TEAM_ID` from `.arcnet/arcnet.yaml` and
select `CSC_LINK`, `CSC_KEY_PASSWORD`, and `APPLE_APP_SPECIFIC_PASSWORD` through
the ArcNet `desktop` consumer. The project source is encrypted in Forum and
its `.arcnet/secrets/` snapshot is decrypted by the GitHub Actions
`ZAPPER_SECRETS_KEY` secret. The build then signs with the hardened runtime
before notarizing and packaging.
The build signs nested runtime binaries with
`apps/macos/Signing/Zapper.entitlements` so the bundled Node/V8 runtime can run
under the hardened runtime.

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
Update that file, run `arcnet check`, and push to `main` to deploy. The landing
page `/download/mac` route redirects to the latest macOS GitHub Release zip.

## Release CI Auth

[`.github/workflows/publish.yaml`](../../.github/workflows/publish.yaml)
loads the `publish` consumer from ArcNet. The standard encrypted source
provides `NPM_TOKEN`; its snapshot lives under `.arcnet/secrets/`. The macOS
release uses the `desktop` consumer and the Zapper project source. After a
Forum secrets edit, run `arcnet secrets sync` and commit the refreshed encrypted
snapshot.
