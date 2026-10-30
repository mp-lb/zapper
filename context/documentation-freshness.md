## Documentation Freshness (Required)

- Update the public MDX files in `apps/docs/content/docs/` when Zap behavior or config changes. `packages/cli/src/config/schemas.ts` is the config source of truth.
- Update `docs/tech/releases.md` and `docs/tech/cli-development.md` when release or development workflows change.
- Keep `.arcnet/arcnet.yaml`, its encrypted snapshots, and ArcNet workflows in sync when production delivery changes.
- Run a docs consistency pass for stale commands, paths, defaults, and examples before finishing.
