# Configuration

Zapper projects are configured with a `zap.yaml` file in the project root.
`packages/cli/src/config/schemas.ts` is the source of truth for supported
fields.

## Minimal Config

```yaml
project: myapp

native:
  api:
    cmd: pnpm dev
```

## Top-Level Fields

```yaml
project: myapp
env: [.env.base, .env]
profiles:
  default:
    env_files: [.env.base, .env]
    services: "*"
  e2e:
    env_files: [.env.base, .env.e2e, .env]
    services: [api, worker, postgres]
    isolate: true
ports:
  - FRONTEND_PORT
  - BACKEND_PORT
init_task: seed
git_method: ssh
task_delimiters: ["{{", "}}"]

native:
  # process definitions

docker:
  # container definitions

volumes:
  # top-level Docker volume declarations

secrets:
  # top-level Docker secret declarations

tasks:
  # task definitions

homepage: http://localhost:3000
notes: "API: http://localhost:${API_PORT}"
links:
  - name: API Docs
    url: http://localhost:${API_PORT}/docs
```

- `project` is required and is used as the PM2/Docker namespace.
- `env` defines root environment file stacks.
- `env_files` is accepted as a compatibility alias for root `env`.
- `profiles` defines named runtime profiles with env files, service selection,
  and optional stack isolation.
- `ports` lists uppercase env var names that Zapper assigns per instance.
- `init_task` names a task to run after `zap init`.
- `git_method` controls repo clone URLs: `ssh`, `http`, or `cli`.
- `runtime` optionally overrides native-process toolchain resolution.
- `task_delimiters` changes task template delimiters.
- `native` defines local PM2-managed processes.
- `docker` and `containers` define Docker-managed services.
- `volumes` declares reusable Docker named volumes.
- `secrets` declares local file/env-backed secrets for Docker services.
- `processes` is accepted as a legacy process form.
- `tasks` defines one-off commands.
- `homepage`, `links`, and `notes` expose project metadata to CLI and tools.

## Environment Files

Root `env` is a file stack:

```yaml
env: [.env.base, .env]
```

Use profiles when you need named env file stacks or service subsets:

```yaml
profiles:
  default:
    env_files: [.env.base, .env]
  proddata:
    env_files: [.env.base, .env.proddata, .env]
    services: "*"
```

Select a saved profile or use one for a single command:

```bash
zap profile use proddata
zap --profile proddata up
zap profile reset
```

Later files override earlier files. Root `env_files` remains a compatibility
alias, but new configs should prefer `env`.

Profile service subsets automatically include `depends_on` dependencies. A
profile can list a native app service and Zapper will still include the Docker
services that app depends on.

See [Environment Variable Management](env-var-mgmt.md) for detailed resolution
rules.

## Runtime

Native processes can run through a runtime provider. By default, Zapper
autodetects common mise project files:

- `mise.toml`
- `.mise.toml`
- `.tool-versions`

When exactly one of those files exists, native PM2 wrappers run service commands
through `mise exec`. Tool versions stay in the mise file; Zapper does not need
to repeat them in `zap.yaml`.

For example:

```toml
# mise.toml
[tools]
node = "lts"
pnpm = "10.10.0"
```

```yaml
native:
  frontend:
    cmd: pnpm dev
```

If multiple runtime files are present, Zapper falls back to `ambient` and
`zap runtime` reports a warning. Set `runtime.provider` explicitly if that is
intentional.

Use explicit runtime config only as an override or escape hatch:

```yaml
runtime:
  provider: mise

native:
  frontend:
    cmd: pnpm dev

  legacy-worker:
    cmd: pnpm dev
    runtime:
      node: 20
```

The top-level runtime is merged into each native process. Service-level runtime
fields override only the fields they set.

If a runtime block names tools but omits `provider`, Zapper treats it as
`provider: mise`:

```yaml
runtime:
  node: lts
  pnpm: latest
```

Supported provider values:

- `ambient` uses the existing captured environment.
- `mise` runs the command through `mise exec`.
- `shell` captures the environment from the user's login shell and bakes it
  into the PM2 wrapper, so processes find tools (nvm-installed node, shims)
  even when `zap up` runs outside an interactive shell. The shell defaults to
  `$SHELL` and can be overridden with `runtime.shell`. Each `zap up` or
  restart re-captures. If capture fails (missing shell, non-zero exit,
  timeout) or on native Windows, Zapper warns and falls back to `ambient`.
- `none` skips Zapper runtime wrapping and runs the command as written.

```yaml
runtime:
  provider: shell
  shell: /bin/zsh # optional, defaults to $SHELL
```

`zap runtime` reports the provider per service and, for `shell`, which shell
binary the environment is captured from.

Supported first-class tool fields are `node`, `pnpm`, `python`, `ruby`, `go`,
and `terraform`. Other mise tools can be declared under `tools`:

```yaml
runtime:
  provider: mise
  tools:
    bun: latest
```

## Config Interpolation

String values inside service, task, metadata, build, watch, volume, and secret
configuration support shell-style interpolation from the resolved root env
stack, assigned ports, and the current process environment:

```yaml
env: [.env]

docker:
  api:
    image: myapp/api:${API_TAG:-dev}
    ports:
      - "${API_PORT?API_PORT is required}:3000"
```

Supported forms:

- `${VAR}` expands to the variable value or an empty string.
- `${VAR:-default}` uses `default` when the variable is unset or empty.
- `${VAR?message}` fails config loading with `message` when the variable is
  unset or empty.
- `$$` emits a literal `$`.

## Port Assignment

Define port variable names in config and initialize them with `zap init`:

```yaml
project: myapp
ports:
  - FRONTEND_PORT
  - BACKEND_PORT
  - DB_PORT
```

Assigned ports have highest precedence over values from `.env` files. This
supports multiple instances of the same project without port collisions.

Most config-backed commands initialize missing instance state automatically.
Read-only commands such as `zap status`, `zap ls`, `zap state`, `zap logs`, and
`zap startup-log` do not create or update `.zap/state.json` just by loading the
project.

State writes are protected by a local lock and saved atomically. If
`.zap/state.json` is malformed, commands that need to update state fail instead
of replacing it with default state.

Interpolation uses assigned port values:

```txt
FRONTEND_PORT=3000
FRONTEND_URL=http://localhost:${FRONTEND_PORT}
```

After initialization, if `FRONTEND_PORT` is assigned `54321`,
`FRONTEND_URL` resolves to `http://localhost:54321`.

## Init Task

Set `init_task` to run a task after initialization:

```yaml
init_task: seed

tasks:
  seed:
    cmds:
      - pnpm db:seed
```

`zap init` performs normal initialization and then runs the task.

## Git Cloning

For multi-repo projects, add `repo` to services and choose a clone method:

```yaml
project: myapp
git_method: ssh

native:
  api:
    cmd: pnpm dev
    cwd: ./api
    repo: myorg/api-service
```

| Method | URL Format                          | Notes               |
| ------ | ----------------------------------- | ------------------- |
| `ssh`  | `git@github.com:myorg/repo.git`     | Requires SSH key    |
| `http` | `https://github.com/myorg/repo.git` | May prompt for auth |
| `cli`  | Uses `gh repo clone`                | Requires GitHub CLI |

Repos are cloned to the service `cwd`.

```bash
zap clone
zap clone api
zap clone api web
```
