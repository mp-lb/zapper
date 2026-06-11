# CLI Tools

A CLI is **just a library with a `bin`** — nothing special, not a separate
package type. It follows the whole library standard in [libs.md](./libs.md); this
doc is only the delta a `bin` adds: how the command-line behaves, and the one
extra generated surface (a command reference). Two governing ideas run through
everything below:

1. **The command tree is the single source of truth.** The help screen and the
   reference docs are generated from it, never maintained by hand in parallel.
2. **A CLI is three layers.** Input is validated, a core layer does the work and
   emits structured output, and a renderer turns that output into whatever the
   caller asked for. Presentation is the only thing that varies.

Reference implementation: **zapper** — see `packages/cli/src/core` (core layer),
`packages/cli/src/ui` (renderers), its Zod config validation, and the output
contract it documents. For releasing, see [lib-release.md](./lib-release.md).

## Architecture

```text
input  ->  core  ->  structured output / events  ->  renderer
(validate)  (work)         (data / report)          (human · json · jsonl)
```

**Input layer.** Parse and validate. **commander** owns the command tree;
**Zod** validates config files, arguments, and any input payload. Nothing past
this layer ever sees unvalidated input — by the time core runs, the shape is
guaranteed.

**Core layer.** Does the work. It takes validated input and **returns structured
output — JSON in, JSON out.** It must not print user-facing text directly. Work
that produces progress before it finishes emits **structured events** (an event
log: `{ "type": "service.started", ... }`), not freeform log lines. The core
layer is presentation-agnostic and is the part worth unit-testing.

**Renderer layer.** The only layer that knows about presentation. It consumes
the structured output/events and renders one of:

- **human** — progress lines, summaries, tables, warnings (the default);
- **`--json`** — one stable JSON value;
- **`--jsonl`** — one structured event per line, for streaming machine output.

The payoff: one output contract with many renderings, a testable core, and
output that is equally first-class for humans and for agents.

## Command output contract

Commands fall into two kinds, and the contract differs:

- **Query commands** read state and return **data**. JSON output *is* the data;
  human output is a formatted view of it.
- **Action commands** do work and return a **report** — a receipt describing what
  was attempted, what changed, what was skipped, and what failed. JSON output is
  that report; human output is a formatted view of it plus any progress events.

Rules:

- Human and machine output **render from the same value**. Core never assembles a
  human string and a JSON object separately.
- **`--json` is a single stable JSON value.** Streaming belongs behind an
  explicit **`--jsonl`** flag that ends with a `command.completed` event. Never
  change what `--json` emits to add streaming.
- Long-running action reports should be **reduced from the emitted events**, not
  assembled in a parallel code path.

Consistent naming across layers:

- **Result** — the command-level value returned to the CLI runner.
- **Report** — the structured receipt from an action command.
- **Data** — the value returned by a query command.
- **Event** — a structured progress item emitted while an action runs.
- **Output** — the general contract renderers consume.

## Interactivity

`--json` controls **rendering**, not behaviour. It must not by itself mean "don't
prompt" or "don't open a browser." For automation-safe behaviour, use a separate
**`--noninteractive`** flag: don't prompt, don't require a TTY, fail or skip
instead of asking, and avoid side effects that need a user session.

## Framework and command modeling

Use **commander** with one root `Command`. Do not hand-roll argument parsing — a
hand-rolled parser makes help a hand-typed string that drifts, and nothing can be
generated from it.

Every command and subcommand is a **real commander command** with its own
`.description()`, `.argument(...)`, and `.option(...)`:

- **Never dispatch subcommands through positional args.** If `foo bar` and
  `foo baz` are different operations they are `.command("bar")` and
  `.command("baz")`, not `foo <action>` parsed inside one handler. Positional
  dispatch is invisible to `--help` and to doc generation.
- **Aliases use `.alias(...)`**, never a duplicate `.command(...)`.
- **Every command has a non-empty one-line description.**

The test: `<cli> <group> --help` should enumerate that group's real sub-actions.

## Standard commands

Every CLI provides, with no exceptions:

- **`--version` / `version`** — the package version.
- **`--help` / `-h`** — on the root *and every subcommand*. With commander
  modeled correctly (above) this is free and always accurate.

## Documentation surfaces

Each surface has one job. Three of the four derive from the command tree.

| Surface | Job | Source |
| --- | --- | --- |
| `--help` | Terse, complete command/flag listing. No prose. | Generated by commander |
| Reference (`docs/commands.md`) | Full per-command reference page | **Generated** from the command tree |
| Narrative guide | Quick start, concepts, configuration | **Hand-written** |
| `llms-full.txt` | Concatenated published docs, for agents | Generated bundle |

**Reference is generated; narrative is hand-written.** A guide must never restate
flags or syntax — it links to the reference. Reference and `--help` are two
renderings of the same metadata, never two documents.

## Generating the reference

Use **`@mp-lb/cli-docs`** (published from the `tools` repo). It takes the
commander root `Command` and emits the reference page plus the `llms-full.txt`
bundle. Wire two package scripts:

- `docs:gen` — regenerate `docs/commands.md` and the raw bundle.
- `docs:check` — fail if the committed reference is stale. Run it in CI so the
  reference cannot drift.

The generated reference may be wrapped in a small hand-written header/footer for
intro framing and cross-links; everything per-command is generated.

## Publishing and docs site

The publishing surfaces — `docs/` (internal) vs `docs/public/` (published), the Fumadocs site, the
`llms-full.txt` bundle, and the `docs:gen` / `docs:check`-in-CI loop — are the
**library** standard. See [libs.md](./libs.md). A CLI adds only the generated
command reference above; everything else about shipping docs is the same as any
library.

## Checklist

Architecture:

- [ ] Input validated with Zod before core runs.
- [ ] Core returns structured output and never prints user-facing text.
- [ ] Progress represented as structured events, not freeform logs.
- [ ] Human / `--json` / `--jsonl` all render from the same output.
- [ ] `--json` is one stable value; streaming is behind `--jsonl`.
- [ ] `--json` controls rendering only; `--noninteractive` controls behaviour.

Commands:

- [ ] Built on commander, single root `Command`.
- [ ] Every subcommand is a real `.command(...)` with description, args, options.
- [ ] No positional-arg subcommand dispatch.
- [ ] Aliases via `.alias(...)`, no duplicate commands.
- [ ] `--version` / `version` and `--help` on every command.

Docs:

- [ ] `docs/commands.md` generated via `@mp-lb/cli-docs`; never hand-edited.
- [ ] Narrative docs link to the reference instead of restating flags.
- [ ] Library docs baseline met — `docs/public/` opt-in publish, Fumadocs site, `docs:check` in
  CI, `llms-full.txt` (see libs.md).
