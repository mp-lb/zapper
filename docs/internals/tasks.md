# Tasks

Tasks are one-off project commands that can use the same env, cwd, and
parameter interpolation model as the rest of Zapper.

## Basic Task

```yaml
tasks:
  seed:
    cmds:
      - pnpm db:seed
```

```bash
zap task seed
zap run seed
```

## Task Options

```yaml
tasks:
  seed:
    desc: Seed the database
    aliases: [s]
    cwd: ./backend
    env: .zap/env/backend.yaml
    silent: false
    interactive: false
    params:
      - name: count
        default: "10"
        desc: Number of records
      - name: env
        required: true
        desc: Target environment
    preconditions:
      - test -n "$DATABASE_URL"
      - sh: test -f prisma/schema.prisma
        msg: Missing Prisma schema
    status:
      - test -d node_modules
    cmds:
      - pnpm db:migrate
      - cmd: "pnpm db:seed --count={{count}}"
        silent: false
```

- `desc` is shown in task listings.
- `aliases` are alternate names accepted by `zap task`.
- `cwd` is relative to the project root.
- `env` uses the same routing modes as service env.
- `silent` hides Zapper task-start lines and command headers.
- `interactive` inherits stdio directly for TTY-sensitive commands.
- `params` defines named task parameters.
- `preconditions` must pass before commands run.
- `status` skips the task when every status command succeeds.
- `cmds` runs shell commands or nested task calls in order.

If a task name or alias is not defined, the command fails with
`Task not found: <name>. Check task names or aliases`.

## Output, Silent Mode, And Interactive Mode

By default, Zapper prints each command before execution, then streams stdout and
stderr in muted task output.

Set `silent: true` on a task to hide Zapper's task-start line and command
headers while preserving command output. Set it on a command object to hide that
command's header, or on a nested task call to hide the nested task-start line
and command headers.

Set `interactive: true` on a task or command object for TTY-sensitive commands
such as database shells, REPLs, SSH sessions, and CLIs that prompt for
authentication. Interactive commands inherit stdio directly and skip Zapper's
output recoloring.

`interactive` on a task or command controls the spawned command's stdio. It is
different from `zap task --interactive`, which prompts for missing required
parameters before execution.

```yaml
tasks:
  console:
    interactive: true
    silent: true
    cmds:
      - psql "$DATABASE_URL"
```

## Parameters

Define named parameters with defaults or mark them required:

```yaml
tasks:
  build:
    params:
      - name: target
        default: development
      - name: minify
    cmds:
      - "npm run build -- --env={{target}}"
```

```bash
zap task build --target=production --minify=true
```

Required parameters fail before commands run:

```yaml
tasks:
  deploy:
    params:
      - name: env
        required: true
    cmds:
      - "deploy.sh {{env}}"
```

```bash
zap task deploy --env=staging
zap task deploy --interactive
```

Without `--interactive`, missing required params fail fast. With
`--interactive`, Zapper prompts for missing required params and then runs the
task with the provided answers.

## Pass-Through Arguments

Use <code v-pre>{{ARGS}}</code> to forward extra CLI arguments with shell
quoting:

```yaml
tasks:
  test:
    cmds:
      - "pnpm vitest {{ARGS}}"
```

```bash
zap task test -- --coverage src/
```

`{{ARGS}}` and `{{CLI_ARGS}}` shell-quote each argument independently, so an
argument that contains spaces or shell-special characters (e.g.
`--notes "two words"`, `--msg "a; b"`) survives as a **single** argument to the
underlying command instead of being re-split by the task shell. Always use
`{{ARGS}}` to forward arguments.

## Special Vars

Tasks can use built-in template vars:

```yaml
tasks:
  inspect:
    cmds:
      - 'echo "project={{PROJECT}} task={{TASK}}"'
      - 'echo "root={{ROOT_DIR}} cwd={{CWD}} instance={{INSTANCE}}"'
```

| Var        | Value                                     |
| ---------- | ----------------------------------------- |
| `ROOT_DIR` | Project root containing the loaded config |
| `CWD`      | Resolved working directory for the task   |
| `TASK`     | Current task name                         |
| `PROJECT`  | Current Zapper project name               |
| `INSTANCE` | Current instance key                      |
| `ARGS`     | Shell-quoted pass-through args (preserves argument boundaries) |
| `CLI_ARGS` | Alias for `ARGS`                          |

Built-in vars are also available when interpolating nested task `vars`,
preconditions, and status checks.

## Task Context Env

Every task command receives task context through environment variables:

```bash
ZAPPER_ROOT
ZAPPER_CWD
ZAPPER_TASK
ZAPPER_PROJECT
ZAPPER_INSTANCE
```

Use these from scripts that should not depend on template interpolation.

## Nested Tasks

Use a task command object to run another task as part of a command sequence.
Nested task calls can pass vars and suppress command headers for the called
task.

```yaml
tasks:
  build:
    params:
      - name: target
        required: true
    cmds:
      - "pnpm build --target={{target}}"

  deploy:
    cmds:
      - task: build
        vars:
          target: production
        silent: true
      - ./deploy.sh
```

## Preconditions

Preconditions are shell commands that must succeed before a task runs. They use
the task's resolved env and cwd.

```yaml
tasks:
  migrate:
    preconditions:
      - test -n "$DATABASE_URL"
      - sh: test -f prisma/schema.prisma
        msg: Missing Prisma schema
    cmds:
      - pnpm prisma migrate dev
```

## Status Checks

Status checks decide whether a task is already up to date. If every status
command succeeds, Zapper skips the task. Use `--force` to run anyway.

```yaml
tasks:
  install:
    status:
      - test -d node_modules
    cmds:
      - pnpm install
```

```bash
zap task install
zap task install --force
```

## Custom Delimiters

If commands contain literal <code v-pre>{{</code> and <code v-pre>}}</code>,
change delimiters:

```yaml
project: myapp
task_delimiters: ["<<", ">>"]

tasks:
  build:
    cmds:
      - 'echo "Building <<target>>"'
```

## Parameter Metadata

For tooling integration, get parameter info as JSON:

```bash
zap task build --list-params
```

Task aliases can be used here as well:

```bash
zap t b --list-params
```

```json
{
  "name": "build",
  "params": [
    {
      "name": "target",
      "default": "development",
      "required": false,
      "desc": "Build target"
    }
  ],
  "acceptsRest": false
}
```

## Common Patterns

```yaml
tasks:
  db:migrate:
    env: .zap/env/database.yaml
    cmds:
      - pnpm prisma migrate dev

  db:seed:
    env: .zap/env/database.yaml
    cmds:
      - pnpm prisma db seed

  lint:
    cmds:
      - pnpm eslint . --fix
      - pnpm prettier --write .

  test:
    env: .zap/env/database.yaml
    cmds:
      - pnpm vitest run
```
