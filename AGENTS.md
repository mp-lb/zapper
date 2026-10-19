# Zapper

A lightweight dev environment runner. Define your local dev setup in a single `zap.yaml` file and boot everything with `zap up`. Uses Zapper's native supervisor for processes and Docker for containers.

**Core philosophy:** Processes are processes—you shouldn't need to care if something is native or containerized.

**Status:** WIP, native process and Docker service workflows working.

## Documentation

- [Public quick start](apps/docs/content/docs/index.mdx) and the other MDX files in `apps/docs/content/docs/` are the Fumadocs website source. Update these for user-facing behavior.
- [Commands](apps/docs/content/docs/commands.mdx), [Configuration](apps/docs/content/docs/configuration.mdx), [Services](apps/docs/content/docs/services.mdx), and [Tasks](apps/docs/content/docs/tasks.mdx) describe supported Zap behavior.
- [CLI development](docs/tech/cli-development.md), [macOS development](docs/tech/macos-development.md), and [Releases](docs/tech/releases.md) cover this repository's build and release process.
- [ArcNet project config](.arcnet/arcnet.yaml) selects production sites, variables, and secret consumers. ArcNet's engine lives in `@mp-lb/arcnet`; Zap Arc stays in this repo.

The docs website also serves `/llms.txt` and `/llms-full.txt` from its MDX source.


## Documentation Freshness (Required)

- Update the public MDX files in `apps/docs/content/docs/` when Zap behavior or config changes. `packages/cli/src/config/schemas.ts` is the config source of truth.
- Update `docs/tech/releases.md`, `docs/tech/cli-development.md`, and `docs/tech/macos-development.md` when release or development workflows change.
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

- **The source is `agents-md/` building blocks; the agent files are *compiled* from them.** `agents-md/index.md` composes the blocks — an H1, a short intro, and a flat list of `@<block>.md` imports: the project's own blocks plus shared blocks pulled in via store references (e.g. `@fssstack/<block>.md`). The blocks + `index.md` are the **only** things you hand-edit.
- **`CLAUDE.md` and `AGENTS.md` are generated outputs, not source.** [`@mp-lb/mdcompile`](https://www.npmjs.com/package/@mp-lb/mdcompile) compiles `index.md` into one flat file per agent — `CLAUDE.md` for Claude, `AGENTS.md` for Codex and the de-facto standard (same content). They're **gitignored — compiled locally, never committed, never hand-edited.** Regenerate with `zap task compile-agents`. No agent's native import syntax is load-bearing, so supporting another agent is just another compile target.
- **The compiled agent file is small on purpose.** It carries the always-true essentials and *points* at the detailed `docs/standards/*` for the rest — read those on demand rather than expecting everything to be in context.

## Tools you can expect to be authenticated

A handful of CLI tools are installed and already authenticated on this machine — use them freely, no setup required.

- **GitHub CLI (`gh`)** — we don't use PRs, but use it to check Actions runs, read issues, inspect remote state.
- **Google Cloud CLI (`gcloud`)**
- **AWS CLI (`aws`)**
- **Zapper** — our process manager and task runner.
- **Doctrine** — our document sync system.

## Git

Some projects use git and some use Doctrine, so be aware of which kind you're in.

**Local-first.** Work happens locally. Branches isolate a piece of work before it merges to `main`. We **rarely push to GitHub — only to deploy**, from `main`, as a separate step. We never use PRs.

**Commit incrementally.** Commit changes straight away. For follow-up fixes, make a new commit, and commit only your own changes — not unrelated ones (other agents may be in the same repo).

**Messages.** No conventions — a short lowercase string. For a follow-up fix, prefix with `fix: `.

## Deployments

Many projects deploy via CI when you push `main`. To confirm a deploy landed, lean on `gh`: glance at how long recent runs took, then schedule a recheck on a fitting cadence rather than polling tightly. Specifics vary by project.

## Doctrine

Unlike GitHub there are no branches — there's always a single source of truth. **Sync before you edit:** the source lives in the cloud, so the local copy can be stale, and editing stale is how you get conflicts. Pull latest first. After syncing, we commit the synced files to git too, so they always live in the repo.

## Task running

Run migrations, tests, the dev server, checks and static analysis, and everything else as **zap tasks** — otherwise environment variables aren't picked up. Add an **npm script only** when CI also needs to run something (prefix those to mark them as CI scripts); the one other exception is super-basic things like the dev server or build, which often connect to Vercel. Two or three standard scripts is fine; four is suspicious — at least one is probably dangling.

## Builds

We run builds locally mainly to confirm they pass. For libraries and especially **CLIs**, we build to produce the artifact; for web servers and apps, mostly just to test that the build runs.

## CLIs

We always keep CLIs built, and make sure the local PATH command is linked to the locally built copy. Check this after making changes to a CLI.

## Working alongside other agents

You're rarely the only agent at work — multiple agents run in the same repo, often the same branch, at once.

- **A dirty tree is normal — it doesn't block you.** Do your own work; don't touch the files someone else is changing, and when you commit, stage only your own files. Only **stop** if your change genuinely collides with a file in flight. Unfamiliar edits are almost certainly another agent's — work around them.
- **Collaboration is often coordinated through RFWs** (below).

## Requests for Work (RFWs)

Discrete work is handed off as **Requests for Work** — a single markdown file carrying the spec for one piece of work: a short header plus **Spec** (definition of done) and **Context**. It's not a ticket — just a clear written spec that travels with the work. Managed in `mgr`: unread `~/Code/mgr/rfw/<project>/<slug>.md`, read `~/Code/mgr/rfw/<project>/read/<slug>.md`. Move it to `read/` as soon as the project picks it up. Template: `~/Code/mgr/processes/rfw.md`.

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


## Documentation layout

This project's docs live under `docs/` with a fixed layout — keep to it:

- **Root = project surface.** Only top-level, act-on-it files belong at the root
  of `docs/`: `README.md`, `STORY.md`, the task board (`*.board.json`), and any
  studies/positioning you want at eye level. Don't drop loose docs here.
- **`docs/internals/` = this project's own docs.** Every system/engineering doc —
  feature docs, architecture notes, setup runbooks, how-things-work explainers —
  lives here. When you write a doc about how something works, it goes in
  `docs/internals/`, never loose at the root.
- **`docs/standards/`, `docs/extensions/`, `docs/examples/`, `docs/skills/` =
  Fssstack store references.** Shared content composed in via the project's
  Doctrine store. Read-through; don't fork or edit casually.
- **`docs/public/`** *(libraries only)* — the opt-in published surface the docs
  site renders (see `standards/libs.md`). Everything else in `docs/` is
  unpublished by default.

The compiled `CLAUDE.md`/`AGENTS.md` stays deliberately small — it carries the
always-true essentials and *points* at `docs/standards/*` for the detail. Read
those on demand rather than expecting everything to be in context.


## Doctrine

Central docs are stored in the cloud using doctrine. You can run commands like `pnpm exec fm read some-file.md` and `pnpm exec fm ls`. Relative file paths are likely to be real files on disk.


## Documentation

This project publishes docs, so they're **generated from the source of truth**, not hand-maintained in parallel — they can't drift:

- A library's API reference comes from its **types**; a CLI's command reference comes from its **commander tree**. You don't hand-write these.
- **After changing public API or CLI commands/flags, run `docs:gen`** to regenerate the reference (and the `llms-full.txt` agent bundle), then commit the result.
- **`docs:check` runs in CI and fails if the committed docs are stale** — regenerating is not optional.
- Hand-written narrative (README, guides) lives beside the generated reference: update it when behaviour changes, but never restate signatures or flags — link to the reference instead.

Read `docs/standards/libs.md` for the full model (and `docs/standards/clis.md` if the package ships a `bin`).

