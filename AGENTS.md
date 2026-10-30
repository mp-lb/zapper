# Zapper

A lightweight dev environment runner. Define your local dev setup in a single `zap.yaml` file and boot everything with `zap up`. Uses Zapper's native supervisor for processes and Docker for containers.

**Core philosophy:** Processes are processes—you shouldn't need to care if something is native or containerized.

**Status:** WIP, native process and Docker service workflows working.

## Documentation

- [Public quick start](apps/docs/content/docs/index.mdx) and the other MDX files in `apps/docs/content/docs/` are the Fumadocs website source. Update these for user-facing behavior.
- [Commands](apps/docs/content/docs/commands.mdx), [Configuration](apps/docs/content/docs/configuration.mdx), [Services](apps/docs/content/docs/services.mdx), and [Tasks](apps/docs/content/docs/tasks.mdx) describe supported Zap behavior.
- [CLI development](docs/tech/cli-development.md) and [Releases](docs/tech/releases.md) cover this repository's build and release process.
- [ArcNet project config](.arcnet/arcnet.yaml) selects production sites, variables, and secret consumers. ArcNet's engine lives in `@mp-lb/arcnet`; Zap Arc stays in this repo.

The docs website also serves `/llms.txt` and `/llms-full.txt` from its MDX source.

The dedicated Forum store `mp-lb/zapper` syncs the entire `docs/` folder. Run `fm sync` from the repository root before and after editing anything under `docs/`; resolve conflicts before continuing. This is the only sync rule. Project engineering notes live under `docs/tech/`. Public website source lives in `apps/docs/content/docs/`.

Read shared standards with `fm read <file>.md --store mp-lb/dev` (list them with `fm ls --store mp-lb/dev`). Read shared extensions with `fm read extensions/<file>.md --store mp-lb/fssstack` (list them with `fm ls extensions --store mp-lb/fssstack`).

## Documentation Freshness (Required)

- Update the public MDX files in `apps/docs/content/docs/` when Zap behavior or config changes. `packages/cli/src/config/schemas.ts` is the config source of truth.
- Update `docs/tech/releases.md` and `docs/tech/cli-development.md` when release or development workflows change.
- Keep `.arcnet/arcnet.yaml`, its encrypted snapshots, and ArcNet workflows in sync when production delivery changes.
- Run a docs consistency pass for stale commands, paths, defaults, and examples before finishing.


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


# How we work

## AGENTS.md and CLAUDE.md

A few conventions about these instruction files themselves:

- **The source is `context/` building blocks; the agent files are compiled from them.** `context/index.md` composes project-specific `@<block>.md` imports and standalone Forum links for shared blocks. Edit the project blocks and index, not the generated files.
- **`CLAUDE.md` and `AGENTS.md` are generated and committed outputs.** The context task first resolves local imports with [`@mp-lb/mdcompile`](https://www.npmjs.com/package/@mp-lb/mdcompile), then pipes that Markdown through `fm compile --stdin` to expand Forum links. Regenerate both files with the project’s context task and commit them with their source changes.
- **The compiled agent file is small on purpose.** It carries the always-true essentials. Read relevant shared standards directly from `mp-lb/dev` on demand with `fm read <file>.md --store mp-lb/dev`.

## Tools you can expect to be authenticated

A handful of CLI tools are installed and already authenticated on this machine — use them freely, no setup required.

- **GitHub CLI (`gh`)** — we don't use PRs, but use it to check Actions runs, read issues, inspect remote state.
- **Google Cloud CLI (`gcloud`)**
- **AWS CLI (`aws`)**
- **Zapper** — our process manager and task runner.
- **Forum** — our document system.

## Git

Some projects also sync project documentation with Forum; check the project's documentation instructions before editing docs.

**Local-first.** Work happens locally. Branches isolate a piece of work before it merges to `main`. We **rarely push to GitHub — only to deploy**, from `main`, as a separate step. We never use PRs.

**Commit incrementally.** Commit changes straight away. For follow-up fixes, make a new commit, and commit only your own changes — not unrelated ones (other agents may be in the same repo).

**Messages.** No conventions — a short lowercase string. For a follow-up fix, prefix with `fix: `.

## Forum

Projects with a dedicated Forum store run `fm sync` before and after editing their mapped docs. Projects without one read shared material directly from Forum and do not need a sync configuration. Follow the project's documentation block for its actual store and layout.

## Task running

Run migrations, tests, the dev server, checks and static analysis, and everything else as **zap tasks** — otherwise environment variables aren't picked up. Add an **npm script only** when CI also needs to run something (prefix those to mark them as CI scripts); the one other exception is super-basic things like the dev server or build, which often connect to Vercel. Two or three standard scripts is fine; four is suspicious — at least one is probably dangling.

## Builds

We run builds locally mainly to confirm they pass. For libraries and especially **CLIs**, we build to produce the artifact; for web servers and apps, mostly just to test that the build runs.

## CLIs

We always keep CLIs built, and make sure the local PATH command is linked to the locally built copy. Check this after making changes to a CLI.

## Working alongside other agents

You're rarely the only agent at work — multiple agents run in the same repo, often the same branch, at once.

- **A dirty tree is normal — it doesn't block you.** Do your own work; don't touch the files someone else is changing, and when you commit, stage only your own files. Only **stop** if your change genuinely collides with a file in flight. Unfamiliar edits are almost certainly another agent's — work around them.
- Coordinate work through the project’s current task tracker and explicit handoff instructions.

## Frontend patterns

Beyond the stack itself (shadcn/ui, Tailwind, tRPC — see the tech-stack and ui blocks), the patterns we lean on:

- The **typeahead** pattern — a command box plus a popover (shadcn popovers, menus, command components).
- **Components we standardize early:** standard modals (one standard-modal component owning scrollbars/footers/action buttons), modal layout (modals as a global layer), and layout components (layout primitives own all whitespace via flex gap; content components are "dumb" and carry no padding of their own).

We have lots of frontend **standards** — always read the ones relevant to what you're working on.

## Backend

The backend is just **tRPC**, few layers. tRPC and Zod handle serialization, so database queries can go directly in procedure handlers — fine for most projects; pull a query into a shared function only when it's used repeatedly.

**Standards to watch:** `errors.md` (throwing/handling exceptions across front and back), `event-schema.md` (anything log-shaped — we treat logs as events).

**Zod-centric schemas.** The same schema serves the database, the API, and frontend forms. Keep them in a central registry (usually the core package); group by domain and avoid duplication — if the same keys appear two or three times, make it its own schema others extend.


## Working locally

You are expected to check logs, check which services are running, update env vars on your own. All code should have hot reloading so you would not need to restart unless the changes are not hot-reloadable. The `.env.local` is for non-secrets. The regular `.env` is for secrets so leave that to the dev, just ask them to update secrets.


## Tech stack

This tech is core and should be used **religiously**:

- Zod
- shadcn/ui and utility functions
- shadcn/ui CLI
- Tailwind CSS
- tRPC
- tRPC's tanstack style hooks
- react-hook-form with zod resolver


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


## Process management

[Zapper](https://docs.zapper.mp-lb.dev) runs this project's processes (native and containerized) and one-off tasks from a single `zap.yaml`. Ports and env vars come from Zapper — never hardcode a dev port or fall back to a framework default. The project is often already running in the background.

A few basics:

```
zap status              # what's running
zap up                  # start everything
zap logs <service> --no-follow
zap restart <service>
zap task <task>         # run a one-off task
```

Beyond these, the CLI has full built-in help — run `zap --help`, or `zap <command> --help` for a specific command. If that's still not enough, the complete documentation is online at <https://docs.zapper.mp-lb.dev>.


## UI

The frontend uses [shadcn/ui](https://ui.shadcn.com/) for UI components. Add new components with `npx shadcn@latest add <component>` from the `apps/frontend` directory.

Always use shadcn/ui where possible, including utilities like `cn` for conditional classnames.




## Delivery

Push `main` to deploy the services selected in `.arcnet/arcnet.yaml`; check the ArcNet workflow to confirm deployment.

Packages are selected by their `package.json`: use `private: true` for internal packages and `private: false` with `publishConfig.access: public` for packages intended for npm. The publisher scans immediate children of `packages/` and `apps/`; a missing `private` field also makes a package eligible. GitHub Packages uses its own registry configuration.

The npm workflow on pushes to `main` compares packed package contents with npm and publishes changed packages at the next patch version. ArcNet supplies the configured publishing credential through its `publish` secret consumer; the secret source must contain `NPM_TOKEN`. Check the workflow run to confirm publication. First publication may require an authenticated local publish, depending on npm credentials and trusted-publisher setup.

## Scripts

Write project scripts in TypeScript in the package that owns the behaviour, or `packages/scripts` when there is no natural owner, and include them in normal lint and typecheck checks. Expose each script as a thin Zap task that invokes it with `tsx` (for example, `zap t somemigration` runs `packages/scripts/somemigration.ts`); keep CI callers aligned when moving scripts.
