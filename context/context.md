## Agent context

Shared agent instructions live in `context/`. `context/index.md` explicitly imports blocks with `@filename.md`, in order. Files that are not imported are not included.

Edit source blocks, not generated root files. To add a block, create it and add its import to the index. To remove one, remove the import and unused file. Keep rules short and specific to the actual project.

Run `zap task context-build` after changes. It calls the shared `mdcompile` CLI from Tools and `fm compile` from Forum directly, then writes matching `AGENTS.md` and `CLAUDE.md`. Keep both CLIs available on PATH. Required local imports and remote reads must succeed before either output is replaced. Commit the source changes and both generated files together.

Keep private and machine-specific instructions in your agent's personal configuration, outside committed context. Rebuild from the shared sources to restore the generated project instructions.

Extensions are documented at `extensions/<extension>/README.md` in the FSS Stack source (`fm read extensions/<extension>/README.md --store mp-lb/fssstack`). Add recurring, non-obvious operational instructions only when a capability needs them; a dependency alone does not justify a context file. Keep setup steps in extension documentation and project details in their existing subject files.

MAP Lab code style is a standalone remote link in `context/index.md`. Forum access is required to refresh it. Generated root files remain usable offline. Keep project overrides in `project.md` after the shared style import.
