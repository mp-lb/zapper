<!--
  This file is the hand-authored header for docs/commands.md.
  The command reference below it is generated from the Zapper command tree.
  Do not edit docs/commands.md by hand — edit this header (or the commands in
  packages/cli/src/cli/CommanderCli.ts) and run:
    pnpm --filter @mp-lb/zapper docs:gen
-->

# Commands

Zapper commands operate on the current project by default. Use `--config` to
point at a specific config file, `--profile <name>` for a one-off profile
override, and `--instance <name>` to target a named instance.

The reference below is generated from the commander command tree, so it always
matches `zap <command> --help`. See [Tasks](tasks.md) for task configuration,
[Configuration](configuration.md) for `zap.yaml` fields, and
[Command Output](output.md) for the JSON/result contract.

## Global Options

| Option | Description |
| --- | --- |
| `-V, --version` | output the version number |
| `--config <file>` | Use a specific config file |
| `--profile <name>` | Use a profile for this invocation |
| `--instance <name>` | Target a named instance (default: default) |
| `-v, --verbose` | Increase logging verbosity |
| `-q, --quiet` | Reduce logging output |
| `-d, --debug` | Enable debug logging |

## `zap up [services...]`

**Aliases:** `start`, `s`, `u`

Start all processes or specific processes

| Option | Description |
| --- | --- |
| `-o, --open` | Open the configured homepage after starting |
| `-j, --json` | Output command result as minified JSON |
| `--jsonl` | Stream command events as JSON Lines |

## `zap down [services...]`

**Aliases:** `stop`, `delete`

Stop all processes or specific processes

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |
| `--jsonl` | Stream command events as JSON Lines |

## `zap kill [project]`

Kill all PM2 processes and Docker containers across all instances for a project

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

## `zap restart [services...]`

**Aliases:** `r`

Restart all processes or specific processes

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |
| `--jsonl` | Stream command events as JSON Lines |

## `zap watch [services...]`

**Aliases:** `w`

Watch Docker service paths and restart or rebuild on changes

## `zap status [services...]`

**Aliases:** `ps`

Show status (PM2 + Docker), optionally for specific services

| Option | Description |
| --- | --- |
| `-a, --all` | Include processes from all projects |
| `-j, --json` | Output status as minified JSON |

## `zap ls [services...]`

List configured services with details and assigned ports

| Option | Description |
| --- | --- |
| `-e, --extended` | Show instance and dangling resource inventory |
| `-a, --all` | Alias for --extended |
| `-j, --json` | Output list as minified JSON |

## `zap logs <services...>`

**Aliases:** `l`

Show logs for one or more services

| Option | Description |
| --- | --- |
| `-f, --follow` | Follow logs (default) |
| `--no-follow` | Do not follow logs (print and exit) |

## `zap startup-log <services...>`

Show saved startup output for one or more services

## `zap reset`

Stop all processes and delete the .zap directory

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

## `zap init`

Initialize local zap state (instance + ports + volumes)

| Option | Description |
| --- | --- |
| `-i, --instance [name]` | Create/select an instance for initialization (default: default) |
| `-R, --random` | Randomize all configured ports instead of preserving existing assignments |
| `-j, --json` | Output command result as minified JSON |

## `zap instance`

Manage the selected local instance

### `zap instance label [label...]`

Show or set the label for the selected instance

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap volume`

Manage Zapper-generated Docker volumes (list, prune, reset)

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

### `zap volume list <service>`

List Docker volumes for a service

| Option | Description |
| --- | --- |
| `--managed` | Only list Zapper-managed generated volumes |
| `--id-only` | Only print Docker volume names |
| `-j, --json` | Output command result as minified JSON |

### `zap volume prune`

Remove stale managed Docker volumes after confirmation

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

### `zap volume reset`

Reset managed Docker volume state for the instance

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap clone [services...]`

Clone all repos defined in native services (respects git_method)

| Option | Description |
| --- | --- |
| `--http` | Use HTTP for git cloning (overrides config git_method) |
| `--ssh` | Use SSH for git cloning (overrides config git_method) |
| `-j, --json` | Output command result as minified JSON |

## `zap task [task]`

**Aliases:** `t`, `run`

Run a one-off task by name, or list all tasks if no task specified

| Option | Description |
| --- | --- |
| `-j, --json` | Output task list as minified JSON |
| `--list-params` | List parameters for the specified task |
| `-f, --force` | Run task even when status checks pass |
| `--interactive` | Prompt for missing required task parameters |

## `zap profile`

**Aliases:** `p`

Manage profiles

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap profile list`

List configured profiles

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap profile current`

Show the current profile

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap profile use <name>`

Switch the saved profile for this project

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap profile reset`

Reset to the default profile

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

## `zap state`

Show the current state JSON

| Option | Description |
| --- | --- |
| `-j, --json` | Output state as minified JSON |

## `zap stack`

Inspect the selected stack id and known profile stacks

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap stack id`

Print the current stack id

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap stack current`

Show the current stack

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

### `zap stack list`

List known profile stacks

| Option | Description |
| --- | --- |
| `-j, --json` | Output as minified JSON |

## `zap git`

Git operations across all native repos

### `zap git status`

**Aliases:** `gst`

List branch and dirty/clean for all native repos

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap git pull`

**Aliases:** `ggpur`

Pull latest for all native repos

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap git checkout <branch>`

**Aliases:** `gco`

Checkout a branch across all native repos

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap git stash`

**Aliases:** `gsta`

Stash any dirty changes across all native repos

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap config`

Show the processed config object as minified JSON

| Option | Description |
| --- | --- |
| `--show-envs` | Include environment variable configurations in output |
| `--pretty` | Format JSON output with indentation |

## `zap validate`

Validate zap.yaml without initializing local state

| Option | Description |
| --- | --- |
| `-j, --json` | Output validation result and full Zod issues as JSON |

## `zap env [service]`

Show resolved environment variables for a service

| Option | Description |
| --- | --- |
| `--service <name>` | Show env vars for a service |
| `-j, --json` | Output as minified JSON |

## `zap launch [name]`

Open homepage by default, or open a configured link by name

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap open [name]`

**Aliases:** `o`

Choose a configured project link interactively

| Option | Description |
| --- | --- |
| `--home` | Open the configured homepage without prompting |
| `--non-interactive` | Open the configured homepage or named link without prompting |
| `-j, --json` | Output command result as minified JSON |

## `zap home`

Print the configured homepage URL

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap links`

List configured links, including the homepage

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap notes`

Print configured project notes

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

## `zap global`

**Aliases:** `g`

Global operations across projects (info, list, prune, kill)

### `zap global list [project]`

**Aliases:** `ls`, `l`

List all global Zapper resources, or a single project

| Option | Description |
| --- | --- |
| `-a, --all` | Legacy no-op; always lists all projects |
| `-j, --json` | Output command result as minified JSON |

### `zap global info [project]`

Show global resources for a project

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap global prune`

Prune stale registry entries and orphaned resources

| Option | Description |
| --- | --- |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

### `zap global kill [project]`

Kill all PM2 + Docker resources for a project

| Option | Description |
| --- | --- |
| `-a, --all` | Kill all projects |
| `-y, --force` | Force the operation |
| `-j, --json` | Output command result as minified JSON |

## `zap system`

Machine-wide Zapper project registry and orphaned resource audit

| Option | Description |
| --- | --- |
| `--prune` | Deprecated no-op; stale projects are always labeled |
| `-j, --json` | Output command result as minified JSON |

### `zap system projects`

List registered Zapper projects and validate their roots

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap system registry`

Manage the machine-wide project registry

#### `zap system registry prune`

Remove stale entries from the project registry

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

#### `zap system registry forget <target>`

Forget a registry entry by id, project root, or config path

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

#### `zap system registry repair`

Prune stale entries and re-validate all projects

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

### `zap system resources`

Audit and clean up orphaned system resources

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

#### `zap system resources audit`

Audit orphaned PM2 processes and Docker containers

| Option | Description |
| --- | --- |
| `-j, --json` | Output command result as minified JSON |

#### `zap system resources cleanup`

Delete orphaned system resources after confirmation

| Option | Description |
| --- | --- |
| `--include-volumes` | Include generated Docker volumes |
| `-y, --force` | Force cleanup operations |
| `-j, --json` | Output command result as minified JSON |

## Shortcuts

Convenience top-level shortcuts that delegate to a subcommand.

| Shortcut | Equivalent | Description |
| --- | --- | --- |
| `zap gst` | `zap git status` | Alias for: git status |
| `zap ggpur` | `zap git pull` | Alias for: git pull |
| `zap gsta` | `zap git stash` | Alias for: git stash |
| `zap gco <branch>` | `zap git checkout` | Alias for: git checkout |
| `zap ginfo [project]` | `zap global info` | Show info for a project (shorthand for 'global info') |
| `zap glist` | `zap global list` | List all projects (shorthand for 'global list') |
| `zap gkill [project]` | `zap global kill` | Kill project resources (shorthand for 'global kill') |
| `zap gprune` | `zap global prune` | Prune stale registry entries and orphaned resources |

## JSON Output

Most non-streaming commands support `--json`. Action commands also support JSON
Lines streaming with `--jsonl` where implemented. When `--json` is enabled,
Zapper suppresses incidental human logs and warnings so stdout stays parseable.
Streaming commands (`logs`, `startup-log`, `task`) keep their stream output and
are not JSON-encoded.

For the command result and rendering contract, see [Command Output](output.md).

## System Registry Storage

System commands inspect machine-wide Zapper state rather than only the current
repository. They back desktop integrations, project discovery, and orphaned
resource cleanup.

On macOS, the system registry defaults to
`~/Library/Application Support/Zapper/registry.json`. On Linux, it defaults to
`$XDG_STATE_HOME/zapper/registry.json`, or `~/.local/state/zapper/registry.json`
when `XDG_STATE_HOME` is unset. Set `ZAPPER_SYSTEM_STATE_HOME` to override the
directory, or `ZAPPER_DISABLE_SYSTEM_REGISTRY=1` to disable registry writes.
