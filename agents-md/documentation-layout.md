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
