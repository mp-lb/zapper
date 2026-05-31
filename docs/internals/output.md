# Command Output

This document describes Zapper's internal command output contract: the structured
result a command produces after interpreting user input and running core logic.
It is not about terminal styling. Human-readable text, JSON, and any future
machine-readable stream should all be renderings of the same structured command
output.

## Goals

- Commands should have one clear output contract.
- JSON output should be predictable across the CLI.
- Human rendering and machine rendering should share the same source data.
- Core execution code should not print user-facing output directly when it can
  report structured results instead.
- Action commands should report what happened; query commands should return the
  information requested.

## Command Kinds

Zapper commands mostly fall into two groups.

### Query Commands

Query commands read state and return that state.

Examples:

- `zap status`
- `zap ls`
- `zap links`
- `zap home`
- `zap state`
- `zap system projects`
- `zap system resources audit`

For these commands, JSON output is the data itself. Human output is a formatted
view of the same data.

Example query result:

```json
{
  "services": [
    {
      "name": "api",
      "status": "online"
    }
  ]
}
```

### Action Commands

Action commands do work and return a report.

Examples:

- `zap up`
- `zap down`
- `zap restart`
- `zap launch`
- `zap reset`
- `zap clone`
- `zap task <name>`
- `zap system resources cleanup`

For these commands, JSON output is a receipt/report for the invocation. It
should describe what was attempted, what changed, what was skipped, and what
failed. Human output is a formatted view of that report and any progress events
that contributed to it.

Example action report:

```json
{
  "status": "success",
  "action": "up",
  "started": ["api", "web"],
  "alreadyRunning": ["db"],
  "stopped": [],
  "failed": [],
  "opened": {
    "status": "success",
    "url": "http://localhost:3000"
  }
}
```

## Rendering Model

The preferred flow is:

```text
command input -> command/core logic -> structured command output -> renderer
```

Renderers decide how output is displayed:

- Human renderer: progress lines, summaries, tables, warnings.
- JSON renderer: one stable JSON value for `--json`.
- JSONL renderer: one JSON event per line for commands that document streaming
  machine output.

The command and core layers should not need to know whether the user requested
human output or JSON except for behavior-affecting options. Output formatting is
a renderer concern.

## Events and Reports

Long-running action commands may produce progress before they finish. Internally,
that progress should be represented as structured events, not direct text logs.

Example events:

```jsonl
{"type":"service.starting","service":"db"}
{"type":"service.started","service":"db"}
{"type":"service.starting","service":"api"}
{"type":"service.started","service":"api"}
{"type":"launch.opened","url":"http://localhost:3000"}
{"type":"command.completed","status":"success"}
```

Those events can be rendered immediately for humans and reduced into the final
action report for JSON.

Public `--json` should remain a single JSON value. Commands that support
streaming machine output should expose it through an explicit `--jsonl` flag
rather than changing `--json`.

## Interactivity

Interactivity is separate from output shape.

`--json` controls rendering. It should not by itself mean "do not prompt" or
"do not open a browser."

If Zapper needs an automation-safe mode, use a separate option such as
`--noninteractive` for behavior:

- do not prompt;
- do not require a TTY;
- fail or skip instead of asking for confirmation;
- avoid side effects that require a user session, if the command defines them
  that way.

## Implementation Guidance

Current command handlers return `CommandResult` values and
`commandResultRenderer` formats those values. Keep that central shape.

When improving action commands:

1. Make the core operation return a structured report.
2. Replace direct user-facing logs from core execution with structured events
   where useful.
3. Have human output and JSON output render from the same result/report.
4. Keep migrations narrow. Convert one command family at a time, starting with
   `up`, `down`, and `restart`.

Avoid building a broad framework before commands need it. The useful invariant
is simple: commands produce structured output, renderers display it.

## Migration Phases

Track this work in small, shippable phases. Each phase should preserve current
human behavior unless the phase explicitly changes it.

- [x] **Phase 0: Document the contract.** Define query data, action reports,
  renderer responsibilities, event terminology, and the `--json` /
  interactivity boundary.
- [x] **Phase 1: Service action reports.** Make `up`, `down`, and `restart`
  return structured reports while preserving existing human progress output.
  Add `zap up -o/--open` as a compound action that starts services and reports
  homepage launch status.
- [x] **Phase 2: Centralize service progress events.** Replace direct
  user-facing logs from service execution with structured events that the human
  renderer formats.
- [x] **Phase 3: Reduce events into reports.** Build final action reports from
  emitted events rather than separately assembled arrays.
- [x] **Phase 4: Apply the pattern to other action commands.** Migrate action
  commands one command family at a time.
  - [x] Simple action reports: `launch`, `clone`, and `reset`.
  - [x] Profile/environment changes.
  - [x] Git actions.
  - [x] System, global, instance, init, kill, and volume actions.
- [x] **Phase 5: Add JSONL for service action events.** `up`, `down`, and
  `restart` support `--jsonl`, which streams structured service events and ends
  with a `command.completed` line. Keep `--json` as a single final JSON value.

## Naming

The codebase may use names such as result, response, report, or output in
different layers. Prefer these meanings:

- **Result**: the command-level value returned to the CLI runner.
- **Report**: the structured receipt returned by an action command.
- **Data**: the structured value returned by a query command.
- **Event**: a structured progress item emitted while an action is running.
- **Output**: the general contract that renderers consume.
