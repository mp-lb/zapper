# Services

Zapper treats local processes and containers as peer services. Native services
run through PM2. Docker services run through Docker CLI.

## Native Processes

```yaml
native:
  api:
    cmd: pnpm dev
```

Full native process shape:

```yaml
native:
  api:
    cmd: pnpm dev
    aliases: [be, backend]
    cwd: ./backend
    env: "*"
    depends_on: [postgres]
    repo: myorg/api-repo
    healthcheck: 10
```

- `cmd` is required.
- `aliases` are alternate names accepted by service-targeting commands.
- `cwd` is relative to the project root.
- `env` controls env routing for the service.
- `depends_on` includes dependencies when starting this service.
- `repo` is used by `zap clone`.
- `healthcheck` can be a delay, HTTP URL, or explicit health check object.

## Docker Services

```yaml
docker:
  redis:
    image: redis:latest
    ports:
      - 6379:6379
```

Full Docker service shape:

```yaml
docker:
  postgres:
    image: postgres:15
    build:
      context: ./postgres
      dockerfile: Dockerfile.dev
      target: dev
      args:
        POSTGRES_VERSION: "15"
    aliases: [db, pg]
    ports:
      - 5432:5432
    env: .zap/env/postgres.yaml
    volumes:
      - /var/lib/postgresql/data
      - postgres-logs:/var/log/postgresql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks: [backend]
    command: postgres -c log_statement=all
    depends_on: [other]
    healthcheck:
      type: delay
      seconds: 10
    watch:
      - path: ./postgres
        action: rebuild
    secrets:
      - db_password
```

- `image` names the image to run. It is required unless `build` is set.
- `build` builds an image from local source before the container starts.
- `ports` use `host:container` mappings and support `${VAR}` interpolation.
- `env` controls env routing for the container.
- `volumes` supports managed volumes, named volumes, and bind mounts.
- `networks` passes Docker network names.
- `command` overrides the image command. Use a string for simple commands, or
  an array when you need exact argument boundaries:

```yaml
docker:
  postgres:
    image: postgres:15
    command: ["postgres", "-c", "log_statement=all"]
```

String commands are split into Docker arguments with basic shell-style quoting.
Array commands are passed through exactly. `command` does not run through a
shell unless you explicitly invoke one:

```yaml
docker:
  app:
    image: alpine
    command: ["sh", "-c", "echo $HOSTNAME"]
```

- `watch` is used by `zap watch` for local restart/rebuild loops.
- `secrets` grants the service access to top-level Docker secrets.

When `build` is set without `image`, Zapper tags the local image as
`zap.<project>.<service>:dev`.

Supported `build` forms:

```yaml
docker:
  api:
    build: ./api

  worker:
    image: myapp-worker:dev
    build:
      context: ./worker
      dockerfile: Dockerfile.dev
      target: dev
      args:
        NODE_ENV: development
```

## Environment Routing

Service `env` has three modes:

```yaml
env: "*"
```

Pass all values from the root env stack.

```yaml
env: [.env.common, .env.frontend, .env.frontend.user]
```

Use a service-specific env file stack instead of the root stack.

```yaml
env: .zap/env/api.yaml
```

Filter the root env stack through a strict whitelist file:

```yaml
vars:
  - DATABASE_URL
  - JWT_SECRET
```

Inline variable whitelists are not supported in `zap.yaml`. Arrays under
service `env` are file stacks.

## Dependencies

Use `depends_on` to include related services when starting a target:

```yaml
docker:
  postgres:
    image: postgres:15

native:
  api:
    cmd: pnpm dev
    depends_on: [postgres]
```

When you run `zap up api`, Zapper also starts `postgres`.

`depends_on` affects service selection by default:

- `zap up <service>` includes transitive dependencies.
- Services without explicit health checks can start in the same wave as their
  dependents.
- If a dependency defines `healthcheck`, dependent services wait until that
  check passes before starting.
- `zap down` stops targeted services in a single wave.
- `zap restart <service>` restarts only the targeted service, not its dependencies.

See [Health Checks](healthchecks.md) for readiness behavior.

## Profiles

Profiles are top-level runtime selections. A profile can choose the env file
stack, the services that participate in the stack, and whether it gets an
isolated stack instance.

```yaml
profiles:
  default:
    env_files: [.env.local, .env]
    services: [api, postgres]
  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: [api, postgres, worker]
    isolate: true

native:
  api:
    cmd: pnpm dev

  worker:
    cmd: pnpm worker
```

```bash
zap up
zap profile use e2e
zap restart
zap profile reset
```

Profile service selection includes dependencies automatically. If a profile
lists `api` and `api` depends on `postgres`, `postgres` participates in that
profile without needing to be listed directly.

## Docker Volumes

Zapper supports Compose-style mounts, top-level named volumes, and a managed
volume form.

```yaml
volumes:
  shared-cache:
    name: myapp-cache
  external-data:
    external: true

docker:
  postgres:
    image: postgres:15
    volumes:
      - /var/lib/postgresql/data
      - /var/lib/postgresql/wal:ro
      - postgres-logs:/var/log/postgresql
      - shared-cache:/cache:ro
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
      - internal_dir: /var/lib/postgresql/wal
        mode: ro
      - name: postgres-config
        internal_dir: /etc/postgresql
      - type: bind
        source: ./fixtures
        target: /fixtures
        read_only: true
      - type: volume
        source: external-data
        target: /data
        read_only: true
```

When a volume entry is only a container path, or an object without `name`,
Zapper generates a Docker volume name and stores it under the selected instance
in `.zap/state.json`. Each instance gets its own generated volume for the same
service/path pair.

Explicit named volumes keep Compose-style behavior and are shared anywhere that
name is reused. Top-level `volumes` can map a logical name to a Docker volume
`name`, or mark it `external` so Zapper does not explicitly create it. Bind
mounts such as `./init.sql:/container/path` are omitted from `zap volume list`.

```bash
zap volume list postgres
zap volume list --managed postgres
zap volume list --managed --id-only postgres
zap volume prune
zap volume reset
```

`zap volume prune` deletes generated Docker volumes that are still in state but
no longer appear in `zap.yaml`. `zap volume reset` forgets generated assignments
without deleting Docker volumes.

## Docker Secrets

Top-level `secrets` define local secret material, and Docker services opt in
per secret. Secrets are mounted read-only under `/run/secrets/<name>` unless a
service-specific target is provided.

```yaml
secrets:
  db_password:
    env: POSTGRES_PASSWORD
  stripe_key:
    file: .secrets/stripe_key

docker:
  postgres:
    image: postgres:15
    secrets:
      - db_password

  api:
    image: myapp-api:dev
    secrets:
      - source: stripe_key
        target: /run/secrets/stripe/api_key
```

Env-backed secrets are written to `.zap/secrets/` with owner-only permissions
before the container starts. File-backed secrets are mounted directly from the
project root.

## Docker Watch

`zap watch` starts the selected watched Docker services, then watches their
configured paths.

```yaml
docker:
  api:
    image: myapp-api:dev
    build: ./api
    watch:
      - path: ./api/src
        action: rebuild
      - path: ./api/config
        action: restart
```

```bash
zap watch
zap watch api
```

`restart` calls `docker restart` for the running container. `rebuild` runs the
normal Zapper restart path, so services with `build` rebuild their local image
before the new container starts.

## Common Docker Examples

```yaml
docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
    env: .env.postgres
    volumes:
      - /var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379

  mongodb:
    image: mongo:7
    ports:
      - 27017:27017
    volumes:
      - /data/db
```
