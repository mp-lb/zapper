## Agent context

Agent instructions are compiled from reusable blocks in `context/`, with `context/index.md` listing the blocks in order. This keeps shared and project-specific instructions easy to maintain.

Edit the blocks and index in `context/`, then run `zap task context-build` to regenerate `AGENTS.md` and `CLAUDE.md`.
