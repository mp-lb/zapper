<!-- Standard -->
## Agent context

Shared agent instructions live in `context/`. `context/index.md` explicitly imports blocks with `@filename.md`, in order. Files that are not imported are not included.

Edit source blocks, not generated root files. To add a block, create it and add its import to the index. To remove one, remove the import and unused file. Keep rules short and specific to the actual project.

Run `zap task context-build` after changes. Review and commit the source changes together with `AGENTS.base.md`, `AGENTS.md`, and `CLAUDE.md`. Without personal additions, all three outputs should match. Missing shared imports are errors, not optional omissions.

Keep private and machine-specific instructions out of committed context. The compiler supports explicit extra context paths for a local working copy; never commit those additions. `zap task context-copy` restores the root agent files from the shared base.

Extensions are documented at `extensions/<extension>/README.md` in the FSS Stack source (`fm read extensions/<extension>/README.md --store mp-lb/fssstack`). Add recurring, non-obvious operational instructions only when a capability needs them; a dependency alone does not justify a context file. Keep setup steps in extension documentation and project details in their existing subject files.

MAP Lab code style is a standalone remote link in `context/index.md`. Context compilation expands local imports with mdcompile, then remote links with `fm compile --stdin`. The shared `fm` CLI on PATH (outside project `node_modules/.bin`) and Forum access are required to refresh it; a failed remote fetch must fail the build. Generated root files remain usable offline. Keep project overrides in `project.md` after the shared style import.

## Code style

- Use PascalCase for components
- Files should have 1 export, and should be named the same. E.g. MyComponent lives in MyComponent.tsx
- Use camelCase for constants, functions, mongo collections
- Use train_case for typed strings
- File routers are an exception
- Generally 1 function/class per file

### Functional decomposition

Good functional decomposition is essential. This applies to react components, hooks, backend functions. Continuously abstract and centralise important code. Functions should be small and "do one thing".

### Code organization

Maintain an extreme approach to code organization. Functions/components should never be large or complex. Generally every function should have it's own file. Those files should be well organised. Continuously break down programs and organise files so that it's always crystal clear what modules relate to each other. You have permission to do this at all times. Flag concerns with the developer if unsure.

Take extra care when organizing tests.

### Tech debt

In general, follow the boy scout principle. But if you come across tech debt that's too big to address, add a .md doc to docs/tech-debt and raise it with the user.


# Zapper

A lightweight dev environment runner. Define your local dev setup in a single `zap.yaml` file and boot everything with `zap up`. Uses Zapper's native supervisor for processes and Docker for containers.

**Core philosophy:** Processes are processes—you shouldn't need to care if something is native or containerized.

**Status:** WIP, native process and Docker service workflows working.

### Related tooling

Shared tooling is developed in sibling checkouts under `~/Work`: Zapper (`zapper`) runs tasks, Forum (`forum`) provides `fm`, Tools (`tools`) provides ArcNet, and Stackforge (`stackforge`) owns setup conventions. When a change belongs in an owned dependency, inspect and update that source repository as needed, follow its `AGENTS.md`, then rebuild/relink the CLI or update the consuming dependency. Verify the command resolves to the intended build.
## Standards

List shared standards with `fm ls --store mp-lb/dev`; read one with `fm read <file>.md --store mp-lb/dev`.
## Development

Create example projects for testing:

```
./packages/cli/examples/myproj/zap.yaml
```

Remember to `pnpm build` and link (usually already linked). Then cd into the example project and zap away.

**Cleanup:** Stop processes and delete `.zap` folders when done.

### Local tool versions

Mise is the base layer: it selects Node and the package manager. Zapper runs tasks and services on top of those tools. Run `mise trust` and `mise install` for checkout setup, then use an activated mise shell or `mise exec -- zap task <task>`.

Read Node from `.node-version` and pnpm from `package.json#packageManager`; `mise.toml` reads these pins rather than duplicating them. npm projects use npm bundled with Node. Preserve the project's versions and package manager. Keep locally built CLI entrypoints in a version-independent PATH directory so switching Node does not hide `zap` or `fm`.
## Validation

Use this verification flow while developing:

* Lint after every small change: `pnpm lint` (or `pnpm lint:fix` to auto-fix).

* Run focused/unit tests as you go: `pnpm --filter @mp-lb/zapper test <path-to-test-file>`.

* Run the normal test suite before wrapping up: `pnpm test`.

* Run end-to-end tests once near the end of a big change, when you think the work is done:

  * `pnpm test:e2e` runs tests inside an isolated Linux VM via `packages/cli/scripts/e2eRun.ts` (macOS + Lima).

  * One-time setup for that VM flow: `zap t e2e-setup`.

  * Then run: `pnpm test:e2e`.

### Agent responsibility

Always build with `pnpm build` after making changes if you're on the main branch in the base repo. Make it clear in your final response that its all built.

### Commands

* `pnpm test` — run CLI unit tests

* `pnpm build` — build all workspace projects

* `pnpm lint:fix` — fix linting issues across workspace projects
## Scripts

Write project scripts in TypeScript in the package that owns the behaviour, or `packages/scripts` when there is no natural owner, and include them in normal lint and typecheck checks. Expose each script as a thin Zap task that invokes it with `tsx` (for example, `zap t somemigration` runs `packages/scripts/somemigration.ts`); keep CI callers aligned when moving scripts.
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
## Delivery

Push `main` to deploy the services selected in `.arcnet/arcnet.yaml`; check the ArcNet workflow to confirm deployment.

Packages are selected by their `package.json`: use `private: true` for internal packages and `private: false` with `publishConfig.access: public` for packages intended for npm. The publisher scans immediate children of `packages/` and `apps/`; a missing `private` field also makes a package eligible. GitHub Packages uses its own registry configuration.

The npm workflow on pushes to `main` compares packed package contents with npm and publishes changed packages at the next patch version. ArcNet supplies the configured publishing credential through its `publish` secret consumer; the secret source must contain `NPM_TOKEN`. Check the workflow run to confirm publication. First publication may require an authenticated local publish, depending on npm credentials and trusted-publisher setup.

Configured service domains: `zapper.mp-lb.dev`, `docs.zapper.mp-lb.dev`. Their service mapping is in `.arcnet/arcnet.yaml`.

<!-- Project types -->
## Frontend

Use shadcn/ui consistently for supported UI patterns. Reuse installed components before creating anything new; when a suitable component is missing, install it through the CLI rather than hand-building a substitute. Use the existing `cn` utility for conditional classes.

Run these commands from the frontend package containing `components.json`:

```sh
pnpm dlx shadcn@latest list @shadcn
pnpm dlx shadcn@latest search @shadcn -q dialog
pnpm dlx shadcn@latest add dialog
```

`components.json` defines component aliases and the theme CSS location; resolve its `aliases.ui` through the app's TypeScript aliases to find installed components. Review existing files before installation and preserve local customizations; do not blindly use `--overwrite`.

Use the shared theme tokens and existing component variants for colors, typography, spacing and radii. UI consistency takes priority over making one screen look different. Do not override theme-owned styles in individual components without a concrete reason; make intentional design-system changes at the shared theme or component level.

MAP Lab's Shad repository (`~/Work/shad`) provides additional components at `https://shad.mp-lb.dev`. Consult its catalog before building an equivalent, for example:

```sh
pnpm dlx shadcn@latest add https://shad.mp-lb.dev/r/ui-states.json
```

CLI reference: https://ui.shadcn.com/docs/cli.

Frontend packages: `apps/landing-page`. Run component installation in the relevant package.
## Libraries and CLIs

Keep public package boundaries explicit. After changing a CLI, build it and verify the installed command resolves to the intended local build. Update and validate public API/command documentation when behavior changes. Use the project's actual build, link and documentation tasks; do not assume tasks that have not been configured.

<!-- Extensions -->
## ArcNet

This project uses ArcNet. `.arcnet/arcnet.yaml` records its configured sources, consumers and selected deployment services. Read that configuration and the project’s delivery instructions before changing infrastructure. Minimal installations may only manage secrets/variables; do not assume an application is deployed.

Keep deployment build paths, runtime entrypoints, health settings and domains aligned with the actual applications. Local databases are not automatically deployment services. Verify the relevant workflow and runtime result after delivery.

Setup and updates: `fm read extensions/arcnet/README.md --store mp-lb/fssstack` and `fm read SETUP.md --store mp-lb/arcnet`.

### Secrets and variables

Read `.arcnet/arcnet.yaml` for the actual Forum sources and configured consumers. Source values live in those stores; encrypted snapshots under `.arcnet/secrets/` are committed. GitHub repository secrets contain CI decryption keys, not the plaintext source values.

After changing sources, run `arcnet secrets sync` or `arcnet variables sync` as appropriate and commit refreshed snapshots. Use `arcnet env check --password` for local validation and `arcnet env run --consumer <name> -- <command>` for a configured consumer. Keep plaintext, passwords and decryption keys out of context and Git.

These delivery sources are distinct from local `.env` secrets and `.env.local` non-secret defaults where the project uses those files.
