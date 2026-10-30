# Taskfile Study

This study compares Zapper's task runner with [Task](https://taskfile.dev/),
using the local clone at `/Users/felixsebastian/Code/task` and the public
`llms-full.txt` documentation as references.

The goal is not to copy all of Task. Task is a mature build runner with a large
surface area. Zapper should keep the task system small, but Task has solved a
set of practical edge cases around one-off commands that are worth adopting.

## Current Zapper Baseline

Zapper currently supports:

- `zap task <name>`, with aliases `zap t` and `zap run`.
- Listing tasks when no task name is provided.
- Task aliases.
- Sequential `cmds`.
- Nested task references with `{ task: "name" }`.
- Nested task vars with `{ task: "name", vars: { key: "value" } }`.
- Per-task `cwd`.
- Per-task resolved env.
- Named parameters with defaults and required validation.
- Pass-through args after `--`, exposed as `{{REST}}`.
- Configurable interpolation delimiters through `task_delimiters`.
- Circular nested-task detection.
- Task and command-level `silent`.
- Task and command-level `interactive`.
- Shell preconditions.
- Shell status checks, with `zap task --force`.

Relevant local files:

- `packages/cli/src/config/schemas.ts`
- `packages/cli/src/core/tasks/TaskRunner.ts`
- `packages/cli/src/core/tasks/TaskRunner.test.ts`
- `packages/cli/src/commands/TaskCommand.ts`
- `packages/cli/src/cli/CommanderCli.ts`
- `docs/tasks.md`

The implementation is intentionally simple: `TaskRunner` walks commands in
order, interpolates Mustache params, and uses `child_process.spawn(command,
{ shell: true, stdio: ["inherit", "pipe", "pipe"] })`. Output is post-processed
into Zapper's bright command header plus grey stdout/stderr style.

## Reference Implementation Shape

Task separates execution into a compiler and executor:

- It compiles tasks before execution, resolving vars, env, dotenv files,
  template expressions, cwd, sources, generates, status checks, preconditions,
  and command/task references.
- It has a fast compile path that deliberately skips dynamic shell vars when it
  only needs enough information for validation, listing, or prompting.
- It runs dependencies before task commands, with dependency concurrency,
  fail-fast behavior, and a recursion limit.
- It decides whether a task should run using `preconditions`, `status`,
  `sources`, `generates`, `method`, `run`, and `--force`.
- It treats interactivity and output grouping as runtime concerns, not template
  concerns.

Useful local Task files:

- `/Users/felixsebastian/Code/task/task.go`
- `/Users/felixsebastian/Code/task/variables.go`
- `/Users/felixsebastian/Code/task/compiler.go`
- `/Users/felixsebastian/Code/task/precondition.go`
- `/Users/felixsebastian/Code/task/requires.go`
- `/Users/felixsebastian/Code/task/status.go`
- `/Users/felixsebastian/Code/task/hash.go`
- `/Users/felixsebastian/Code/task/internal/execext/exec.go`
- `/Users/felixsebastian/Code/task/executor_test.go`

## Tests Worth Mining

Task has substantial coverage around exactly the edge cases Zapper is likely to
hit:

- Vars: OS env, Taskfile vars, CLI vars, task vars, dynamic shell vars, variable
  references, and inheritance across included taskfiles.
- Required vars: missing vars, vars supplied by the task itself, enum
  validation, dynamic enum refs, and validation before template compilation.
- Status: shell status checks, source checksum/timestamp checks, generated
  files, missing source files, verbose up-to-date output, and cleanup on error.
- Preconditions: successful preconditions, failing preconditions, failures in
  dependencies, and failures in task calls inside `cmds`.
- Prompts: yes/no task prompts, junk input, no terminal, `--yes`, and indirect
  task prompts.
- Loops: command loops, dependency loops, loops over sources/generates, matrix
  loops, variable loops, and task loops.
- Dependencies: parallel dependency execution, fail-fast, task vars in deps, and
  silent dependencies.
- Includes: namespacing, aliases, silent inheritance, checksum behavior, and
  include cycles.
- Platforms: OS/arch filtering at task and command level.
- Output: interleaved, grouped, prefixed, and task prefix templating.

For Zapper, the immediate test inspiration is not "copy the fixtures." It is to
add focused tests for each behavior we adopt:

- A failing precondition prevents command execution and returns a clear error.
- `silent: true` suppresses command headers without muting command output.
- An interactive task can run a command that reads stdin without Zapper buffering
  or recoloring the stream.
- Required params fail before interpolation produces confusing empty strings.
- Nested task params/env/cwd have explicit inheritance rules.
- Task aliases cannot conflict silently.
- Pass-through args preserve boundaries and quoting well enough for common
  package-manager commands.

## Doing But Currently Fragile Or Broken

These are areas where Zapper already has a version of the feature, but Task
solves important reliability edges that Zapper does not yet cover.

### Parameters And Vars

Zapper has `params` and `{{REST}}`; Task has a full vars model. The reference
implementation resolves variables in a deliberate order: environment, special
vars, global vars, include vars, call vars, then task vars. Dynamic shell vars
are cached, run in the right directory, and have access to the resolved env.

Zapper gaps:

- Unknown named params only warn; there is no enum/allowed-values validation.
- Task params are only validated on the top-level task. Nested task references
  cannot pass vars today, so reusable task patterns are limited.
- `REST` is a single joined string. Task exposes both `CLI_ARGS` and
  `CLI_ARGS_LIST`, which avoids forcing every caller to re-split shell args.
- Mustache interpolation is much weaker than Task's Go templates and Sprig-like
  functions. That is probably fine, but the limits should be explicit.
- There are no special task vars such as task name, project root, current task
  cwd, or original user working directory.

Recommendation: keep Zapper's simpler `params` model, but add `ARGS` as an
array-like concept internally, document quoting limits for `REST`, and support
vars on nested task calls:

```yaml
tasks:
  deploy:
    cmds:
      - task: build
        vars:
          target: production
```

### Cwd And Directory Creation

Zapper resolves task `cwd` relative to project root. Task also templates dirs,
expands shell-style paths, creates missing directories before running, and
handles included Taskfile dirs.

Zapper gaps:

- No path expansion for `~` or env vars.
- No clear behavior for missing `cwd`.
- No special var for original working directory.

Recommendation: fail clearly when `cwd` does not exist unless we intentionally
add `mkdir: true`. Task's automatic directory creation is useful for build
outputs but surprising for dev-environment commands.

### Output And Silent Mode

Zapper now supports task and command-level `silent`, and otherwise prints
command headers and recolors command output.
Task has `silent` at root, task, dependency, and command level. It suppresses
echoed commands while preserving stdout/stderr. Task also changes output style
for interactive tasks to avoid breaking terminal programs.

Remaining Zapper gaps:

- No root-level `silent` default for all tasks.
- No silent setting on dependency calls because Zapper does not have `deps` yet.
- Non-interactive output is still always piped and rewritten, which can affect
  programs that detect TTY behavior unless the task or command uses
  `interactive: true`.

Implemented shape:

```yaml
tasks:
  db:
    silent: true
    cmds:
      - psql "$DATABASE_URL"
```

### Interactive And TTY Behavior

Task has two related ideas:

- `--interactive` / config `interactive`: prompt for missing required vars when
  a TTY exists.
- task-level `interactive: true`: use interleaved output behavior for commands
  that need direct terminal interaction.

Zapper now supports task and command-level `interactive: true`, which spawns
with inherited stdio and skips output recoloring. Non-interactive tasks still
use `stdio: ["inherit", "pipe", "pipe"]`, so stdin reaches the child, but
stdout/stderr are pipes.

Remaining Zapper gaps:

- No CLI/config `--interactive` behavior for prompting missing params.
- No non-TTY fallback semantics.
- Tests verify inherited stdio, but there are not yet E2E tests with a real TTY
  command such as a REPL or database shell.

Recommendation: later add `zap task --interactive` for prompting required
params.

### Nested Tasks

Zapper supports nested task calls, vars on nested calls, silent nested calls,
and cycle detection. Task also supports dependencies in `deps`, platform
filtering, ignore-error, and broader precondition propagation.

Remaining Zapper gaps:

- There is no recursion limit beyond stack cycle detection. Task caps calls to
  avoid runaway indirect recursion.
- There are no dependency semantics separate from command order.

Recommendation: add a recursion cap and then consider sequential `deps`.

### Error Semantics

Task has typed errors for task not found, internal task, name conflicts, command
execution, cancellation, recursion limit, missing vars, and failed
preconditions. Zapper has task-not-found and command failure strings, but fewer
semantic distinctions.

Zapper gaps:

- A command failure says exit code and command, but not which task/command index
  failed in a structured way.
- No ignore-error behavior.
- No clear cancellation or no-terminal error categories for future prompts.

Recommendation: as new task features land, add explicit error classes. This
will matter for JSON output and CLI integrations.

## Ideas To Add From Task

This is the high-value subset. Features are ordered by likely usefulness for
Zapper users, not by Task's full feature graph.

### 1. `silent` (Implemented)

Why it matters: lots of local dev tasks contain secrets, noisy shell pipelines,
or commands whose output is self-explanatory. Users expect to hide command
echoing.

Recommended scope:

- root-level task default is optional; task-level support is enough initially.
- command-level support is useful once object commands exist.
- silent should suppress Zapper's command header only.

### 2. `interactive: true` (Implemented)

Why it matters: database shells, REPLs, CLIs with prompts, package-manager auth,
and tools like `ssh`, `psql`, `rails console`, or `python manage.py shell`
should work.

Recommended scope:

- task-level `interactive: true`.
- spawn with inherited stdio.
- skip grey output rewriting.
- document that JSON mode cannot structure interactive stream output.

### 3. Preconditions (Implemented)

Why it matters: preconditions are a lightweight reliability layer for common
dev setup failures.

Recommended scope:

```yaml
tasks:
  db:migrate:
    preconditions:
      - test -n "$DATABASE_URL"
      - sh: test -f prisma/schema.prisma
        msg: "Missing Prisma schema"
    cmds:
      - pnpm prisma migrate dev
```

Execution behavior should match Task's core idea:

- run preconditions after env/cwd resolution and before commands;
- stop the task on first failed precondition;
- print the custom message when present;
- propagate failures through nested task calls.

### 4. `deps`

Why it matters: users often want setup tasks to happen before a command without
embedding them in the visible command sequence.

Recommended scope:

- Start with sequential deps to keep behavior deterministic.
- Allow vars on deps.
- Later consider parallel deps and fail-fast.

### 5. `status`, `sources`, `generates`, And `--force` (Partially Implemented)

Why it matters: this is the core "do not rerun work unnecessarily" feature in
Task. It is valuable for generated code, builds, migrations, and setup steps.

Recommended scope:

- Shell `status` checks and `zap task --force` are implemented.
- Add `sources`/`generates` checks later if build-like tasks become common.
- Avoid copying Task's full checksum/timestamp machinery until there is demand.

### 6. Required Param Prompting

Why it matters: required params are better UX when running manually, but must be
automation-safe.

Recommended scope:

- Add `zap task --interactive <task>` to prompt for missing required params.
- Detect non-TTY and fail with the same missing-param error.
- Keep `--json` separate from behavior; do not make JSON imply noninteractive.

This lines up with Zapper's existing docs principle that interactivity is
separate from output shape.

### 7. Special Vars

Why it matters: these remove fragile shell snippets in task definitions.

Recommended initial vars:

- `PROJECT_ROOT`
- `TASK`
- `TASK_CWD`
- `USER_CWD`
- `REST`
- `ARGS`

Task has many more (`ROOT_DIR`, `TASKFILE`, `TASK_EXE`, `CLI_FORCE`,
`CLI_SILENT`, checksum/timestamp vars, etc.), but Zapper should start with the
ones that support local dev ergonomics.

### 8. Platform Filters

Why it matters: teams often share one config across macOS and Linux.

Recommended scope:

```yaml
tasks:
  open-db:
    platforms: [darwin]
    cmds:
      - open postgres://localhost
```

This is useful but lower priority than silent/interactivity/preconditions.

## Features To Defer

Task has many valuable features that are probably too much for Zapper's task
system right now:

- Includes and remote Taskfiles.
- Full Go-template/Sprig expression support.
- Loops and matrix execution.
- Watch mode.
- Multiple output grouping modes.
- Task summaries.
- Prompt confirmations separate from param prompting.
- Internal tasks.
- Global Taskfiles.
- Checksum/timestamp fingerprint storage compatible with Task.
- Bash `set`/`shopt` configuration.
- Fuzzy task-name suggestions.

These can be revisited after Zapper has a reliable core runner.

## Suggested Roadmap

1. Add real TTY E2E coverage for `interactive: true`.
2. Add `ARGS`/`CLI_ARGS_LIST` to avoid forcing callers to re-split `REST`.
3. Add a recursion cap for nested task calls.
4. Add sequential `deps`.
5. Add `--interactive` prompting for required params.
6. Consider `sources`/`generates` if build-like tasks become common.

This sequence keeps the implementation close to current Zapper behavior while
addressing the edge cases Task has already proven matter in real projects.
