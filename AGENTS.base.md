# Zapper

A lightweight dev environment runner. Define your local dev setup in a single `zap.yaml` file and boot everything with `zap up`. Delegates to PM2 for processes, Docker for containers.

**Core philosophy:** Processes are processes—you shouldn't need to care if something is native or containerized.

**Status:** WIP, basic start/stop of PM2 processes working.

## Documentation

* **[Docs site / Quick Start](docs/index.md)** — VitePress entrypoint and primary user-facing quick start; update this first for important user workflows

* **[Commands](docs/internals/commands.md)**, **[Configuration](docs/internals/configuration.md)**, **[Services](docs/standards/services.md)**, and **[Tasks](docs/internals/tasks.md)** — Comprehensive command and `zap.yaml` field reference; keep these in sync with supported behavior

* **[CLI Development](docs/internals/cli-development.md)** — To see how we run/test/build the CLI

* **[macOS Development](docs/internals/macos-development.md)** — To see how we build/test the menu bar app

Raw agent docs are generated automatically from the docs website Markdown files
as `/llms.txt` and `/llms-full.txt`.

## Documentation Freshness (Required)

* Any behavior change must include doc updates in the same PR.

* If `zap.yaml` behavior or supported fields change, update the docs website before finishing:
  * Update `docs/index.md` when the change affects a common quick-start workflow.
  * Update `docs/internals/commands.md`, `docs/internals/configuration.md`, `docs/standards/services.md`, or `docs/internals/tasks.md` for full reference details.
  * Do not hand-edit `docs/public/llms.txt` or `docs/public/llms-full.txt`; regenerate them through the docs build/raw script.

* If release/development workflow changes, update `docs/internals/releases.md`, `docs/internals/cli-development.md`, and `docs/internals/macos-development.md`.

* Treat `packages/cli/src/config/schemas.ts` as the source of truth for config keys.

* Before wrapping up, run a docs consistency pass:

  * Check for contradictions between code and docs.

  * Check for stale command names, flags, defaults, and examples.

  * Ensure newly introduced config fields are documented or explicitly marked as legacy/internal.

## Development

Create example projects for testing:

```
./packages/cli/examples/myproj/zap.yaml
```

Remember to `pnpm build` and link (usually already linked). Then cd into the example project and zap away.

**Cleanup:** Stop processes and delete `.zap` folders when done.

## Commands

* `pnpm test` — run CLI unit tests

* `pnpm build` — build all workspace projects

* `pnpm lint:fix` — fix linting issues across workspace projects

## Verification

Use this verification flow while developing:

* Lint after every small change: `pnpm lint` (or `pnpm lint:fix` to auto-fix).

* Run focused/unit tests as you go: `pnpm --filter @mp-lb/zapper test <path-to-test-file>`.

* Run the normal test suite before wrapping up: `pnpm test`.

* Run end-to-end tests once near the end of a big change, when you think the work is done:

  * `pnpm test:e2e` runs tests inside an isolated Linux VM via `packages/cli/etc/e2e_run.sh` (macOS + Lima).

  * One-time setup for that VM flow: `bash ./packages/cli/etc/e2e_setup.sh`.

  * Then run: `pnpm test:e2e`.

### Agent responsibility

Always build with `pnpm build` after making changes if you're on the main branch in the base repo. Make it clear in your final response that its all built.
