# Zapper Reference

Complete reference for `zap.yaml` syntax and all CLI commands.

---

## Table of Contents

- [Installation](#installation)
- [Project Configuration](#project-configuration)
- [CLI Commands](#cli-commands)
- [Native Processes](#native-processes)
- [Docker Services](#docker-services)
- [Environment Variables](#environment-variables)
- [Instances](#instances)
- [Tasks](#tasks)
- [Dependencies](#dependencies)
- [Profiles](#profiles)
- [Links](#links)
- [Notes](#notes)
- [Git Cloning](#git-cloning)

---

## Installation

```bash
npm install -g pm2 @maplab/zapper
```

For VS Code/Cursor, install the extension: `felixsebastian.zapper-vscode`

Docker-backed services require Docker CLI. On macOS, Zapper now attempts to
auto-install Docker Desktop via Homebrew (`brew install --cask docker`) when
Docker is missing. If Homebrew is unavailable or install fails, Zapper exits
with manual install instructions.

---

## Project Configuration

### Minimal config

```yaml
project: myapp

native:
  api:
    cmd: pnpm dev
```

### Full config structure

```yaml
project: myapp                    # Required. Used as PM2/Docker namespace
env_files:                        # Load env vars from these files
  default: [.env.base, .env]
  prod_dbs: [.env.base, .env.prod-dbs]
ports:                            # Port names to assign random values
  - FRONTEND_PORT
  - BACKEND_PORT
init_task: seed                   # Optional task to run after `zap init`
git_method: ssh                   # ssh | http | cli (for repo cloning)

native:
  # ... process definitions

docker:
  # ... container definitions

tasks:
  # ... task definitions

homepage: http://localhost:3000   # Optional default URL for `zap launch`
notes: "API: http://localhost:${API_PORT}" # Optional note text for `zap notes`

links:
  # ... quick reference links
```

---

## CLI Commands

### Global Options

Available with any command:

```bash
--config <file>    # Use a specific config file (default: zap.yaml)
-v, --verbose      # Increase logging verbosity
-q, --quiet        # Reduce logging output
-d, --debug        # Enable debug logging
```

Examples:

```bash
zap --config prod.yaml up
zap --config staging.yaml status
zap --debug restart
zap --verbose --config custom.yaml task build
```

### Starting and stopping

```bash
zap up                      # Start all services
zap up backend              # Start one service (and its dependencies)
zap up api worker db        # Start multiple services
zap up --json               # Output command result as JSON
zap down                    # Stop all services
zap down backend            # Stop one service
zap down api worker db      # Stop multiple services
zap down backend --json     # Output command result as JSON
zap restart                 # Restart all services
zap restart api             # Restart one service (does not restart its dependencies)
zap restart api worker db   # Restart multiple services
zap r api worker            # Short alias for: zap restart api worker
```

### Status and logs

```bash
zap status                  # Show status of all services
zap status api db           # Show status for specific services
zap ls                      # List services/containers with details (status, ports, cwd, cmd)
zap ls api db               # List details for specific services
zap ls --json               # Output detailed list as JSON
zap logs api                # Follow logs for one service
zap logs api worker --no-follow  # Show logs for multiple services and exit
```

When passing multiple services to `zap logs`, use `--no-follow`.

### Tasks

```bash
zap task                           # List all tasks
zap task <name>                    # Run a task
zap run <name>                     # Alias for: zap task <name>
zap task seed
zap task build --target=prod       # Run with named parameters
zap task test -- --coverage        # Run with pass-through args
zap task build --list-params       # Show task parameters as JSON
```

### Utilities

```bash
zap reset                   # Stop all services and delete .zap folder
zap reset --json            # Output command result as JSON
zap kill                    # Kill all PM2 processes and containers for current project, across all instances
zap kill my-old-project     # Kill all PM2 processes and containers for a specific project, across all instances
zap kill --force            # Skip the interactive confirmation
zap kill --json             # Output kill result as JSON
zap clone                   # Clone all repos defined in config
zap clone api               # Clone one repo
zap clone api web           # Clone multiple repos
zap clone --json            # Output command result as JSON
zap init                    # Initialize local state for the default instance (and run init_task if configured)
zap init --instance e2e     # Initialize/create a named instance
zap init -R                 # Force full port re-randomization
zap init --json             # Output as JSON
zap launch                  # Open homepage (if configured)
zap launch "API Docs"       # Open a configured link by name
zap launch "API Docs" --json # Output command result as JSON
zap home                    # Print homepage URL (if configured)
zap home --json             # Output homepage value as JSON
zap notes                   # Print notes (if configured)
zap notes --json            # Output notes value as JSON
zap open                    # Alias for: zap launch
zap o "API Docs"            # Short alias for: zap launch "API Docs"
```

### Profiles

```bash
zap profile dev             # Enable a profile
zap profile --disable       # Disable active profile
zap profile dev --json      # Output profile action result as JSON
```

### Environments

```bash
zap env --list                    # List available environment sets
zap env prod_dbs                  # Switch env file set
zap env --disable                 # Reset to default env set
zap env prod_dbs --json           # Output environment action result as JSON
```

Aliases:

```bash
zap environment --list
zap envset prod_dbs
```

### JSON Output

Most non-streaming commands support `--json` and will print machine-readable JSON to stdout.
Examples: `up`, `down`, `restart`, `clone`, `reset`, `kill`, `status`, `ls`, `task` (list/params), `profile`, `env`, `state`, `config`, `launch`, `home`, `notes`, `init`, and git subcommands.

Streaming commands keep stream output and are not JSON-encoded:

```bash
zap logs <service> [more-services...] [--no-follow]
zap task <name>
```

`zap kill <project>` does not require a local `zap.yaml`; it targets resources by prefix (`zap.<project>.*`).

---

## Native Processes

Native processes run via PM2 on your local machine.

### Basic process

```yaml
native:
  api:
    cmd: pnpm dev
```

### All options

```yaml
native:
  api:
    cmd: pnpm dev              # Required. Command to run
    cwd: ./backend             # Working directory (relative to zap.yaml)
    env:                       # Env vars to pass (whitelist)
      - PORT
      - DATABASE_URL
      - DEBUG=true             # Inline override
    depends_on: [postgres]     # Start these first
    profiles: [dev, test]      # Only start when profile matches
    repo: myorg/api-repo       # Git repo (for zap clone)
    healthcheck: 10            # Seconds to wait before considering "up"
    # OR
    healthcheck: http://localhost:3000/health  # URL to poll for readiness
```

### Working directory

```yaml
native:
  frontend:
    cmd: pnpm dev
    cwd: ./packages/frontend   # Relative to project root
```

### Multiple processes

```yaml
native:
  api:
    cmd: pnpm dev
    cwd: ./api

  worker:
    cmd: pnpm worker
    cwd: ./api

  frontend:
    cmd: pnpm dev
    cwd: ./web
```

---

## Docker Services

Containers managed via Docker CLI.

### Basic container

```yaml
docker:
  redis:
    image: redis:latest
    ports:
      - 6379:6379
```

### All options

```yaml
docker:
  postgres:
    image: postgres:15         # Required. Docker image
    ports:                     # Port mappings (host:container)
      - 5432:5432
    env:                       # Env vars for container
      - POSTGRES_DB=myapp
      - POSTGRES_PASSWORD=dev
    volumes:                   # Volume mounts
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    depends_on: [other]        # Start dependencies first
    profiles: [dev]            # Profile filtering
    healthcheck: 10            # Seconds to wait before considering "up"
    # OR
    healthcheck: http://localhost:5432  # URL to poll for readiness
```

### Common database setups

#### PostgreSQL

```yaml
docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
    env:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
```

#### MongoDB

```yaml
docker:
  mongodb:
    image: mongo:7
    ports:
      - 27017:27017
    volumes:
      - mongodb-data:/data/db
```

#### Redis

```yaml
docker:
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
```

#### MySQL

```yaml
docker:
  mysql:
    image: mysql:8
    ports:
      - 3306:3306
    env:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_DATABASE=myapp
    volumes:
      - mysql-data:/var/lib/mysql
```

---

## Environment Variables

Zapper uses a **whitelist approach**: define where vars come from, then each service declares which ones it needs.

### Loading from files

```yaml
env_files: [.env]                    # Single file
env_files: [.env.base, .env]         # Multiple files (later files override)
```

### Environment sets (recommended)

You can define multiple env file sets and switch between them with
`zap env <name>`. The `default` set is optional; if omitted and no
environment is active, no env files are loaded.

```yaml
env_files:
  default: [.env.base, .env]
  prod_dbs: [.env.base, .env.prod-dbs]
```

Legacy array syntax is still supported:

```yaml
env_files: [.env.base, .env]
```

### Recommended pattern

Split into two files:

- `.env.base` — non-secrets (ports, URLs), **committed** to git
- `.env` — secrets (API keys, passwords), **gitignored**

```yaml
env_files: [.env.base, .env]
```

### Whitelisting per service

Each service only receives the vars it explicitly lists:

```yaml
native:
  backend:
    cmd: pnpm dev
    env:
      - PORT
      - DATABASE_URL
      - JWT_SECRET

  frontend:
    cmd: pnpm dev
    env:
      - VITE_API_URL
```

Backend sees `PORT`, `DATABASE_URL`, `JWT_SECRET`. Frontend only sees `VITE_API_URL`. No leakage.

### Inline values

Override or hardcode values inline:

```yaml
native:
  api:
    cmd: pnpm dev
    env:
      - PORT=3000                    # Hardcoded value
      - DATABASE_URL                  # From env_files
      - DEBUG=true                    # Override
```

### Port assignment

Define port variable names in your config and initialize values with `zap init`:

```yaml
project: myapp
ports:
  - FRONTEND_PORT
  - BACKEND_PORT
  - DB_PORT

env_files: [.env]

native:
  frontend:
    cmd: pnpm dev
    env:
      - FRONTEND_PORT
  backend:
    cmd: pnpm dev
    env:
      - BACKEND_PORT
      - DB_PORT
```

Then run:

```bash
zap init                        # Initializes ports for default instance
zap init --instance e2e         # Initializes ports for named instance
zap init -R                     # Re-randomizes all configured ports in selected instance
```

If `init_task` is set, `zap init` runs that task after initialization completes.
This is equivalent to running `zap init` first and then `zap task <init_task>`.

The assigned ports have **highest precedence** - they override values from any `.env` files. This is useful for:

- Avoiding port conflicts when running multiple instances
- Dynamic port assignment in development
- Sharing configurations with different port needs

**Interpolation works with assigned ports:**

```env
# .env
FRONTEND_PORT=3000
FRONTEND_URL=http://localhost:${FRONTEND_PORT}
```

After `zap init`:

```bash
# If FRONTEND_PORT was assigned 54321
FRONTEND_URL will be http://localhost:54321
```

### Docker env vars

Docker services can use env vars too:

```yaml
docker:
  postgres:
    image: postgres:15
    env:
      - POSTGRES_PASSWORD=dev        # Hardcoded
      - POSTGRES_DB                   # From env_files
```

Docker `ports` mappings also support interpolation, including values initialized by `ports:`:

```yaml
ports:
  - MONGO_PORT

docker:
  mongodb:
    image: mongo:latest
    ports:
      - ${MONGO_PORT}:27017
```

### Inspecting resolved env vars

```bash
zap env --service api              # Show resolved env vars for a service
zap env api                        # Works if no environment set named 'api'
```

---

## Instances

Instances let you run multiple stacks for the same project without name or port collisions.

```bash
zap up                                # Auto-creates default instance on first run
zap up --instance e2e                 # Run a named instance
zap init --instance e2e               # Explicitly create/init named instance
```

If you omit `--instance`, Zapper targets `default`. Instance keys must use lowercase letters and hyphens only. See [Instances](instances.md) for full details.

---

## Tasks

One-off commands that can use your env vars and accept parameters.

### Basic task

```yaml
tasks:
  seed:
    cmds:
      - pnpm db:seed
```

### All options

```yaml
tasks:
  seed:
    desc: Seed the database          # Description (shown in help)
    cwd: ./backend                   # Working directory
    env:                             # Env vars to pass
      - DATABASE_URL
    params:                          # Named parameters
      - name: count
        default: "10"
        desc: Number of records
      - name: env
        required: true
        desc: Target environment
    cmds:                            # Commands to run (in order)
      - pnpm db:migrate
      - 'pnpm db:seed --count={{count}}'
```

### Running tasks

```bash
zap task seed
zap task lint
```

### Running a task automatically after init

Set `init_task` to any defined task name:

```yaml
init_task: seed

tasks:
  seed:
    cmds:
      - pnpm db:seed
```

When you run `zap init`, Zapper performs normal initialization and then runs that task.

### Parameters

Tasks can accept named parameters and pass-through arguments.

#### Named parameters

Define parameters with defaults and validation:

```yaml
tasks:
  build:
    desc: Build for target environment
    params:
      - name: target
        default: development
        desc: Build target
      - name: minify
        desc: Enable minification
    cmds:
      - 'echo "Building for {{target}}"'
      - 'npm run build -- --env={{target}}'
```

Run with parameters:

```bash
zap task build --target=production --minify=true
```

#### Required parameters

Mark parameters as required (task fails if not provided):

```yaml
tasks:
  deploy:
    params:
      - name: env
        required: true
        desc: Deployment environment
    cmds:
      - 'deploy.sh {{env}}'
```

```bash
zap task deploy --env=staging    # Works
zap task deploy                  # Error: Required parameter 'env' not provided
```

#### Pass-through arguments (REST)

Use `{{REST}}` to forward extra CLI arguments:

```yaml
tasks:
  test:
    desc: Run tests with optional args
    cmds:
      - 'pnpm vitest {{REST}}'
```

Everything after `--` is passed through:

```bash
zap task test -- --coverage src/
# Runs: pnpm vitest --coverage src/
```

#### Custom delimiters

If your commands contain `{{` and `}}`, use custom delimiters:

```yaml
project: myapp
task_delimiters: ["<<", ">>"]

tasks:
  build:
    cmds:
      - 'echo "Building <<target>>"'
```

### Listing task parameters

For tooling integration (VS Code extension), get parameter info as JSON:

```bash
zap task build --list-params
```

Output:

```json
{
  "name": "build",
  "params": [
    { "name": "target", "default": "development", "required": false, "desc": "Build target" }
  ],
  "acceptsRest": false
}
```

### Common task patterns

#### Database operations

```yaml
tasks:
  db:migrate:
    desc: Run database migrations
    env: [DATABASE_URL]
    cmds:
      - pnpm prisma migrate dev

  db:seed:
    desc: Seed the database
    env: [DATABASE_URL]
    cmds:
      - pnpm prisma db seed

  db:reset:
    desc: Reset and reseed database
    env: [DATABASE_URL]
    cmds:
      - pnpm prisma migrate reset --force
```

#### Code quality

```yaml
tasks:
  lint:
    cmds:
      - pnpm eslint . --fix
      - pnpm prettier --write .

  typecheck:
    cmds:
      - pnpm tsc --noEmit

  test:
    env: [DATABASE_URL]
    cmds:
      - pnpm vitest run

  checks:
    desc: Run all checks before committing
    cmds:
      - pnpm eslint .
      - pnpm tsc --noEmit
      - pnpm vitest run
```

---

## Dependencies

Control startup order with `depends_on`.

### Basic dependency

```yaml
docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432

native:
  api:
    cmd: pnpm dev
    depends_on: [postgres]     # Postgres starts first
```

### Dependency chain

```yaml
docker:
  postgres:
    image: postgres:15

  redis:
    image: redis:7

native:
  api:
    cmd: pnpm dev
    depends_on: [postgres, redis]

  worker:
    cmd: pnpm worker
    depends_on: [api]          # API (and its deps) start first

  frontend:
    cmd: pnpm dev
    depends_on: [api]
```

When you run `zap up frontend`, Zapper starts: postgres → redis → api → frontend.

`depends_on` affects start order only.

- `zap up` / `zap restart` start waves are dependency-aware.
- `zap down` stops targeted services in a single wave.
- `zap restart <service>` restarts only the targeted service(s), not their dependencies.

---

## Profiles

Run different subsets of services.

### Defining profiles

```yaml
native:
  api:
    cmd: pnpm dev
    profiles: [dev, test]

  api-prod:
    cmd: pnpm start
    profiles: [prod]

  frontend:
    cmd: pnpm dev
    profiles: [dev]

docker:
  postgres:
    image: postgres:15
    profiles: [dev, test]

  postgres-test:
    image: postgres:15
    env:
      - POSTGRES_DB=test
    profiles: [test]
```

### Using profiles

```bash
zap up                     # Starts only services with no `profiles` field
zap profile dev            # Enables 'dev' profile and starts matching services
zap restart                # Restarts all services using active profile filtering
zap profile --disable      # Disables active profile
```

### Default behavior

Services without a `profiles` field run regardless of profile state.
Services with a `profiles` field run only when an active profile matches.

---

## Links

Quick reference links for your project. These are for your own reference and can be displayed by tooling.

You can also set a top-level `homepage` URL as the default target for `zap launch` with no arguments.
Use `zap home` to print the homepage URL instead of opening a browser.

### Homepage

```yaml
homepage: http://localhost:3000
```

### Basic usage

```yaml
links:
  - name: API Docs
    url: https://api.example.com/docs
  - name: Staging
    url: https://staging.example.com
  - name: Figma
    url: https://figma.com/file/abc123
```

### Environment variable interpolation

Link URLs support `${VAR}` syntax to reference environment variables from your `env_files`:

```yaml
env_files: [.env]

links:
  - name: API
    url: http://localhost:${API_PORT}
  - name: Frontend
    url: http://localhost:${FRONTEND_PORT}
```

### Opening links

```bash
zap launch                     # Open homepage
zap launch "API Docs"          # Open by link name (quote if spaces)
zap home                       # Print homepage
zap open                       # Alias for: zap launch
zap o "API Docs"               # Short alias for: zap launch "API Docs"
```

### Properties

| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Display name (max 100 characters) |
| `url` | Yes | URL (supports `${VAR}` interpolation) |

---

## Notes

Top-level project notes you can print with `zap notes`.
The notes string supports `${VAR}` interpolation from your `env_files`.

### Configuration

```yaml
env_files: [.env]
notes: |
  Frontend: http://localhost:${FRONTEND_PORT}
  API: http://localhost:${API_PORT}
```

### Usage

```bash
zap notes                      # Print interpolated notes
zap notes --json               # JSON output
```

---

## Git Cloning

For multi-repo setups, Zapper can clone repositories.

### Configuration

```yaml
project: myapp
git_method: ssh              # ssh | http | cli

native:
  api:
    cmd: pnpm dev
    cwd: ./api
    repo: myorg/api-service

  web:
    cmd: pnpm dev
    cwd: ./web
    repo: myorg/web-app
```

### Git methods

| Method | URL Format | Notes |
|--------|-----------|-------|
| `ssh` | `git@github.com:myorg/repo.git` | Requires SSH key |
| `http` | `https://github.com/myorg/repo.git` | May prompt for auth |
| `cli` | Uses `gh repo clone` | Requires GitHub CLI |

### Cloning

```bash
zap clone                  # Clone all repos
zap clone api              # Clone one repo
zap clone api web          # Clone multiple repos
```

Repos are cloned to the path specified in `cwd`.

---

## Full Example

A complete example for a typical full-stack app:

```yaml
project: myapp
env_files: [.env.base, .env]
git_method: ssh

native:
  api:
    cmd: pnpm dev
    cwd: ./api
    repo: myorg/api
    env:
      - PORT
      - DATABASE_URL
      - REDIS_URL
      - JWT_SECRET
    depends_on: [postgres, redis]

  worker:
    cmd: pnpm worker
    cwd: ./api
    env:
      - DATABASE_URL
      - REDIS_URL
    depends_on: [api]

  frontend:
    cmd: pnpm dev
    cwd: ./web
    repo: myorg/web
    env:
      - VITE_API_URL
    depends_on: [api]

docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
    env:
      - POSTGRES_DB=myapp
      - POSTGRES_PASSWORD=dev
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379

tasks:
  db:migrate:
    desc: Run migrations
    env: [DATABASE_URL]
    cmds:
      - pnpm --filter api prisma migrate dev

  db:seed:
    desc: Seed database
    env: [DATABASE_URL]
    params:
      - name: count
        default: "10"
        desc: Number of seed records
    cmds:
      - 'pnpm --filter api prisma db seed --count={{count}}'

  test:
    desc: Run tests with optional args
    env: [DATABASE_URL]
    cmds:
      - 'pnpm vitest {{REST}}'

  deploy:
    desc: Deploy to environment
    params:
      - name: env
        required: true
        desc: Target environment (staging, production)
    cmds:
      - 'deploy.sh {{env}}'

  lint:
    cmds:
      - pnpm eslint . --fix
      - pnpm tsc --noEmit

homepage: http://localhost:5173
notes: "Docs: http://localhost:3000/docs"

links:
  - name: API Docs
    url: http://localhost:3000/docs
  - name: Storybook
    url: http://localhost:6006
```
