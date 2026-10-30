## Documentation

- [Public quick start](apps/docs/content/docs/index.mdx) and the other MDX files in `apps/docs/content/docs/` are the Fumadocs website source. Update these for user-facing behavior.
- [Commands](apps/docs/content/docs/commands.mdx), [Configuration](apps/docs/content/docs/configuration.mdx), [Services](apps/docs/content/docs/services.mdx), and [Tasks](apps/docs/content/docs/tasks.mdx) describe supported Zap behavior.
- [CLI development](docs/tech/cli-development.md) and [Releases](docs/tech/releases.md) cover this repository's build and release process.
- [ArcNet project config](.arcnet/arcnet.yaml) selects production sites, variables, and secret consumers. ArcNet's engine lives in `@mp-lb/arcnet`; Zap Arc stays in this repo.

The docs website also serves `/llms.txt` and `/llms-full.txt` from its MDX source.

The dedicated Forum store `mp-lb/zapper` syncs the entire `docs/` folder. Run `fm sync` from the repository root before and after editing anything under `docs/`; resolve conflicts before continuing. This is the only sync rule. Project engineering notes live under `docs/tech/`. Public website source lives in `apps/docs/content/docs/`.

Read shared standards with `fm read <file>.md --store mp-lb/dev` (list them with `fm ls --store mp-lb/dev`). Read shared extensions with `fm read extensions/<extension>/README.md --store mp-lb/fssstack` (list them with `fm ls extensions --store mp-lb/fssstack`).

### Documentation Freshness (Required)

- Update the public MDX files in `apps/docs/content/docs/` when Zap behavior or config changes. `packages/cli/src/config/schemas.ts` is the config source of truth.
- Update `docs/tech/releases.md` and `docs/tech/cli-development.md` when release or development workflows change.
- Keep `.arcnet/arcnet.yaml`, its encrypted snapshots, and ArcNet workflows in sync when production delivery changes.
- Run a docs consistency pass for stale commands, paths, defaults, and examples before finishing.
