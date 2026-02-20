# Zapper

A lightweight dev environment runner. Define your local dev setup in a single `zap.yaml` file and boot everything with `zap up`. Delegates to PM2 for processes, Docker for containers.

**Core philosophy:** Processes are processes—you shouldn't need to care if something is native or containerized.

**Status:** WIP, basic start/stop of PM2 processes working.

## Documentation

* **[Usage](docs/usage.md)** — Comprehensive docs, keep this up to date

* **[Development](docs/development.md)** — To see how we run/test/build the app

## Documentation Freshness (Required)

* Any behavior change must include doc updates in the same PR.

* If `zap.yaml` behavior or supported fields change, update `docs/usage.md` before finishing.

* If release/development workflow changes, update `docs/releases.md` and `docs/development.md`.

* Treat `src/config/schemas.ts` as the source of truth for config keys.

* Before wrapping up, run a docs consistency pass:

  * Check for contradictions between code and docs.

  * Check for stale command names, flags, defaults, and examples.

  * Ensure newly introduced config fields are documented or explicitly marked as legacy/internal.

## Development

Create example projects for testing:

```
./examples/myproj/zap.yaml
```

Remember to `pnpm build` and link (usually already linked). Then cd into the example project and zap away.

**Cleanup:** Stop processes and delete `.zap` folders when done.

## Commands

* `pnpm test` — run tests

* `pnpm build` — build the project

* `pnpm lint:fix` — fix linting issues

## Verification

Use this verification flow while developing:

* Lint after every small change: `pnpm lint` (or `pnpm lint:fix` to auto-fix).

* Run focused/unit tests as you go: `pnpm test <path-to-test-file>`.

* Run the normal test suite before wrapping up: `pnpm test`.

* Run end-to-end tests once near the end of a big change, when you think the work is done:

  * `pnpm test:e2e` runs tests inside an isolated Linux VM via `etc/e2e_run.sh` (macOS + Lima).

  * One-time setup for that VM flow: `bash ./etc/e2e_setup.sh`.

  * Then run: `pnpm test:e2e`.

### Agent responsibility

Always build with `pnpm build` after making changes if you're on the main branch in the base repo. Make it clear in your final response that its all built.
