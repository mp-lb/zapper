## Agent context

Shared agent instructions live in `context/`. `context/index.md` explicitly imports blocks with `@filename.md`, in order. Files that are not imported are not included.

Edit source blocks, not generated root files. To add a block, create it and add its import to the index. To remove one, remove the import and unused file. Keep rules short and specific to the actual project.

Run `zap task context-build` after changes. Review and commit the source changes together with `AGENTS.base.md`, `AGENTS.md`, and `CLAUDE.md`. Without personal additions, all three outputs should match. Missing shared imports are errors, not optional omissions.

Keep private and machine-specific instructions out of committed context. The compiler supports explicit extra context paths for a local working copy; never commit those additions. `zap task context-copy` restores the root agent files from the shared base.

Extensions are documented at `extensions/<extension>/README.md` in the FSS Stack source (`fm read extensions/<extension>/README.md --store mp-lb/fssstack`). Add recurring, non-obvious operational instructions only when a capability needs them; a dependency alone does not justify a context file. Keep setup steps in extension documentation and project details in their existing subject files.

MAP Lab code style is a standalone remote link in `context/index.md`. Context compilation expands local imports with mdcompile, then remote links with `fm compile --stdin`. The shared `fm` CLI on PATH (outside project `node_modules/.bin`) and Forum access are required to refresh it; a failed remote fetch must fail the build. Generated root files remain usable offline. Keep project overrides in `project.md` after the shared style import.
