# Context files

Fssstack projects keep agent context easy to inspect, easy to regenerate, and
safe for each developer to customize locally.

The committed source of truth is split in two:

- `agents-md/` contains the project-level source blocks.
- `AGENTS.base.md` is the built project context, generated from those blocks and
  committed to git.

The local runtime files are not committed:

- `AGENTS.md`
- `CLAUDE.md`

Those files are gitignored because they may include developer-local or
machine-local context. They should be treated as generated working files, not
reviewed project source.

## Tasks

Each project should expose two Zap tasks:

- `zap task context-build [extra-context ...]` builds the project source blocks
  into `AGENTS.base.md`, then copies that result to `AGENTS.md` and `CLAUDE.md`.
- `zap task context-copy` copies the committed `AGENTS.base.md` to `AGENTS.md`
  and `CLAUDE.md` without rebuilding.

Both tasks may accept output flags for agent-specific files:

- `--agents` writes only `AGENTS.md`.
- `--claude` writes only `CLAUDE.md`.

When neither flag is present, both local files are written.

`context-build` may also accept one or more extra context paths. These are
appended after the project-level blocks before writing the local agent files.
This is for developer-local context such as `~/Code/mgr/agents-md/global.md` or
any other private instruction file a developer wants in their own working copy.

## Workflow

Most developers should not need to understand the compilation step. After cloning
or syncing a project, they can run:

```bash
zap task context-copy
```

That produces the local files expected by coding agents from the committed
`AGENTS.base.md`.

Developers who want personal or global context can instead run:

```bash
zap task context-build ~/some/global.md
```

The important invariant is that reviewers see the project context in
`AGENTS.base.md` and the source blocks in `agents-md/`, while each developer can
generate local agent files that include their own extra context without
committing it.
