# Commands

Zapper commands operate on the current project by default. Use `--config` to
point at a specific config file.

## Global Options

```bash
zap --config prod.yaml up
zap --profile e2e up
zap --debug restart
zap --verbose task build
```

- `--config <file>` uses a specific config file instead of `zap.yaml`.
- `--profile <name>` uses a profile for this invocation without changing saved
  profile state.
- `-v, --verbose` increases logging verbosity.
- `-q, --quiet` reduces logging output.
- `-d, --debug` enables debug logging.

## Start And Stop Services

```bash
zap up
zap up --open
zap up backend
zap up api worker db
zap down
zap down backend
zap restart
zap restart api
zap r api worker
zap watch
zap watch api
```

`zap up`, `zap down`, and `zap restart` accept service names and service
aliases. Unknown names are reported, and valid names in the same command still
run. `zap up <service>` includes dependencies. Explicit health checks decide
whether dependents wait for those dependencies to be ready. `zap restart <service>`
restarts only the targeted service.

`zap watch` starts Docker services that define `watch` rules and keeps running.
When a watched path changes, Zapper either restarts the container or rebuilds
and restarts it based on the rule action.

## Status And Logs

```bash
zap status
zap status api db
zap ls
zap ls --extended
zap ls --json
zap logs api
zap logs api worker --no-follow
zap startup-log api
```

`zap ls --extended` includes instance, dangling, and alien resource inventory.
When passing multiple services to `zap logs`, use `--no-follow`.

If a service fails during startup, Zapper saves the last startup attempt output
under `.zap/logs/`. Use `zap startup-log <service>` to inspect it.

## Tasks

```bash
zap task
zap task seed
zap run seed
zap task build --target=prod
zap task test -- --coverage
zap task build --list-params
zap task seed --force
zap task deploy --interactive
```

`zap run` is an alias for `zap task`. `--force` runs a task even when its
status checks say it is already up to date. `--interactive` prompts for missing
required task parameters instead of failing immediately. Task aliases work
anywhere a task name is accepted, including `--list-params`.

See [Tasks](tasks.md) for task configuration.

## Project Metadata

```bash
zap launch
zap launch "API Docs"
zap links
zap home
zap notes
zap open
zap o "API Docs"
zap open --home
zap open --non-interactive
```

`zap launch` opens the configured homepage or a named link without prompting.
`zap open` shows an interactive link picker when run without a link name. Use
the arrow keys to choose a link, then press Enter to open it, or press Ctrl+C
to abort. `zap open <name>`
and `zap o <name>` open a named link directly. `zap open --home` explicitly
opens the configured homepage. `zap open --non-interactive` keeps the old
script-friendly behavior and opens the configured homepage.

See [Project Metadata](project-metadata.md) for `homepage`, `links`, and
`notes`.

## Project Utilities

```bash
zap init
zap init --instance e2e
zap init -R
zap validate
zap stack id
zap stack current
zap stack list
zap reset
zap kill
zap kill my-old-project
zap kill --force
zap clone
zap clone api web
```

`zap init` ensures local state exists for the selected instance and runs
`init_task` if configured. `zap init -R` re-randomizes configured ports.
`zap stack` inspects the selected stack and known profile stacks.

`zap kill <project>` does not require a local `zap.yaml`; it targets resources
by prefix.

## Instances And Volumes

```bash
zap up --instance e2e
zap instance label
zap instance label "local checkout"
zap volume list postgres
zap volume list postgres --json
zap volume list --managed --id-only postgres
zap volume prune
zap volume reset
```

See [Instances](instances.md) and [Services](services.md) for the related
configuration behavior.

## Profiles And Env

```bash
zap profile list
zap profile current
zap profile use e2e
zap profile reset
zap --profile e2e up
zap env --service api
zap env api
```

Profiles combine env file stacks, service selection, and optional stack
isolation. `zap profile use <name>` updates saved local state;
`--profile <name>` is a one-command override. `zap env <service>` inspects the
resolved environment for a service and no longer switches state.

## System Registry

System commands inspect machine-wide Zapper state rather than only the current
repository. They are used by desktop integrations, project discovery, and
orphaned resource cleanup.

```bash
zap system projects
zap system projects --json
zap system registry prune
zap system registry forget <target>
zap system registry repair
zap system resources audit
zap system resources cleanup
zap system resources cleanup --include-volumes
zap global list
zap global ls
zap g ls
zap global prune
zap global prune --force
zap g kill --force
```

`zap system projects` validates registered project roots and config paths.
Missing projects stay in the registry with `state: "stale"` so CLI and desktop
views share one source of truth.

`zap global prune` audits stale registry entries, PM2 processes, Docker
containers, and generated Docker volumes before deleting anything. Use
`--force` or `-y` for non-interactive runs.

For `zap global list`, `--all` is a legacy no-op; the command always lists all
discovered global Zapper resources unless you pass a project name.

On macOS, the system registry defaults to
`~/Library/Application Support/Zapper/registry.json`. On Linux, it defaults to
`$XDG_STATE_HOME/zapper/registry.json`, or `~/.local/state/zapper/registry.json`
when `XDG_STATE_HOME` is unset. Set `ZAPPER_SYSTEM_STATE_HOME` to override the
directory, or `ZAPPER_DISABLE_SYSTEM_REGISTRY=1` to disable registry writes.

## JSON Output

Most non-streaming commands support `--json`. Action commands also support
JSON Lines streaming with `--jsonl` where implemented.

Examples of JSON-capable commands include `up`, `down`, `restart`, `clone`,
`reset`, `kill`, `status`, `ls`, `profile`, `env`, `state`, `config`,
`launch`, `links`, `home`, `notes`, `init`, `instance`, `system`, and git
subcommands.

When `--json` is enabled, Zapper suppresses incidental human logs and warnings
so stdout stays parseable. Streaming commands keep stream output and are not
JSON-encoded:

```bash
zap logs <service> [more-services...] [--no-follow]
zap startup-log <service> [more-services...]
zap task <name>
```

For the command result and rendering contract, see [Command Output](output.md).
