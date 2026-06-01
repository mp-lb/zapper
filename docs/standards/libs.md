# Libraries

What we expect for documenting a publishable library (an importable package).
A **library** is our first-class unit — the dashboard and setup docs recognise it
as *the* package type. Everything below applies to every library.

**If your library ships a `bin`** (i.e. it's a CLI), also follow
[clis.md](./clis.md) — a CLI is just a library with a `bin`, and that doc covers
the extra it needs (command-line architecture, behaviour, and a generated command
reference). For releasing, see [lib-release.md](./lib-release.md).

Governing idea: **the types are the single source of truth.** Auto-generate what
can be auto-generated, and keep hand-written narrative for what types can't
express — narrative never restates the generated surface.

A library's surface is often *fully visible from its types*, so its docs can stop
there — that's where "keep it lightweight" comes from. The one exception is a
library that ships a `bin`: a CLI's behaviour isn't visible from its types, so it
always needs a generated command reference (see [clis.md](./clis.md)).

## Types are the documentation

Every published library emits declarations (`declaration: true`, plus
`declarationMap: true` for go-to-source). The shipped `.d.ts` is the always-on,
zero-effort API reference: consumers get signatures, params, and return types via
editor hover and IntelliSense. This is rule #1 of auto-generating what we can.

## Doc comments

- **Do not document types with comments** — the type already does it. No
  `@param {type}` / `@returns {type}`; it's redundant in TS and rots.
- Use **TSDoc** (the standardized subset TypeDoc reads), not freeform JSDoc, and
  only for what the type can't express: a one-line summary, `@example`,
  `@remarks` (the why / gotchas), `@throws`, `@deprecated`, `@see`.
- Add `@param name - meaning` only when the parameter name isn't self-evident.
- **Public API only** — no doc comments on internals. A comment adds what the
  signature can't say; it never repeats it.

## How much to document

Scale the effort to the library's surface area.

- **Tier 0 — every library:** declarations on + a README that is a real front
  door (install, a ~30-second example, links out). For a small utility this is
  the *entire* doc story — types + README, nothing more.
- **Tier 1 — libraries with real surface area:** generate an API reference with
  **TypeDoc → markdown** into `docs/public/`, render it with the shared
  **Fumadocs** docs-site app type, emit the `llms-full.txt` bundle, and add a
  hand-written guide for concepts and recipes.

Threshold: *if you can't comfortably navigate the API from the README alone,
generate the reference.*

## Tooling

Use **TypeDoc** with markdown output. Explicitly avoid api-extractor /
api-documenter — that's Microsoft's heavyweight `.d.ts`-rollup pipeline built for
Rush-scale libraries, and it's the opposite of lightweight.

## Component libraries

Visual component libraries (e.g. `jalco-ui`) are documented via a rendered
**showcase** — we already use `shad` for this — not TypeDoc. The showcase is the
reference; type docs add little for visual components.

## Docs layout: internal by default, publish by opt-in

`docs/` is **internal by default** — working docs, design notes, studies,
positioning, dev and release runbooks. None of it is published.

Publishing is **opt-in**: a doc is published only once it lives under
`docs/public/`. The docs site builds from `docs/public/` and nothing else.

- `docs/` — internal. The default home for any doc. Not published.
- `docs/public/` — the opt-in published surface: the generated API reference
  plus the hand-written guides the docs site renders.

Use the folder boundary, not a per-file include list: a new doc is internal
unless you deliberately move it under `docs/public/`, so nothing leaks by
accident.

## Docs site

A **Tier 1** library publishes its `docs/public/` as a site built with
**Fumadocs** — the shared FSS Stack docs-site app type (React Router), augmented
by the `@mp-lb/docs-site` preset: curated nav and sidebar, local search, and a
"Raw" link to `llms-full.txt` for agents. Every page is one of two kinds:

- **Generated reference** — TypeDoc → markdown, never hand-edited.
- **Hand-written guide** — quick start, concepts, recipes. The guide links to
  the reference; it never restates signatures.

Keep the committed reference from drifting with two package scripts:

- `docs:gen` — regenerate the TypeDoc markdown and the `llms-full.txt` bundle.
- `docs:check` — fail if the committed docs are stale. Run it in **CI** so the
  reference can't drift from the types.

**The shared Fumadocs site is the default renderer, not a requirement.** What's
standardized is the *generation*: published docs land in `docs/public/` as
markdown, `llms-full.txt` is bundled, and `docs:check` keeps them fresh in CI. A
project with its own site — e.g. **Doctrine** — may render that same
`docs/public/` however it likes; it still follows the generation, layout, and
freshness standard, and only the rendering differs.

A **Tier 0** library has no site — the README is the whole front door.

## Keeping sites consistent across repos

Libraries live in **separate repos**, so consistency comes from two shared
pieces rather than copy-paste: every docs site is scaffolded from the FSS Stack
**Fumadocs docs-site app type**, then augmented by the published
**`@mp-lb/docs-site`** preset (shared theme, config, and global tsconfig).
Bumping the preset updates every site; template-level changes roll out via
`migrations/`.

## Checklist

- [ ] Declarations emitted (`declaration` + `declarationMap`).
- [ ] README is a real front door (install, short example, links).
- [ ] TSDoc only where it adds value; no type-restating comments; public API only.
- [ ] Tier assigned: Tier 0 (types + README) or Tier 1 (generated API reference).
- [ ] Tier 1 only: TypeDoc→markdown reference, Fumadocs site (shared preset), `llms-full.txt`.
- [ ] Tier 1 only: `docs:gen` / `docs:check`, with `docs:check` wired into CI.
- [ ] Component libraries documented via showcase, not TypeDoc.
- [ ] `docs/` internal by default; published docs opt in under `docs/public/`.
