# Zapper

A lightweight dev environment runner for local multi-service projects.

## Install

```bash
npm install -g @mp-lb/zapper
```

On Windows, run Zapper from WSL2. Use Linux paths in `zap.yaml`, and make sure
Docker is reachable from that WSL distro before starting Docker services.

## Create `zap.yaml`

```yaml
project: myapp
env: [.env]

native:
  backend:
    cmd: pnpm dev
    env: "*"

  frontend:
    cmd: pnpm dev
    cwd: ./frontend
    env: "*"

docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
```

## Run

```bash
zap up
zap status
zap down
```

## Add Tasks

Use tasks for one-off project commands that should share the same local
environment.

```yaml
tasks:
  seed:
    preconditions:
      - test -n "$DATABASE_URL"
    cmds:
      - pnpm db:seed

  console:
    interactive: true
    silent: true
    cmds:
      - psql "$DATABASE_URL"
```

```bash
zap task seed
zap task console
```

For full reference docs, see [Commands](commands.md),
[Configuration](configuration.md), [Services](services.md), and
[Tasks](tasks.md).

For profile-based env files, service selection, and isolated stacks, see
[Profiles](profiles.md).

For readiness waits and dependency startup behavior, see
[Health Checks](healthchecks.md).

For packaging and local machine runtime plans, see
[Local Runtime Compatibility](local-runtime.md).

For the command result and rendering contract, see
[Command Output](output.md).

For CLI development, testing, and release workflow, see
[CLI Development](cli-development.md).

For the local menu bar app development loop, see
[macOS Development](macos-development.md).
