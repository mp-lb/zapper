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
