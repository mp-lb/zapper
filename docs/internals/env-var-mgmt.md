# Environment Variable Management

This document explains the environment variable model and the reasoning behind
it. For concise syntax reference, see [Configuration](configuration.md) and
[Services](services.md).

## Goals

Zapper should make local development environment variables easy to share across
services without forcing users to copy the same values into many places.

The original model is still sound:

1. Load environment variables from a central source.
2. Treat that source as the local source of truth.
3. Decide what each service receives.

The problem is that explicit routing is too much ceremony for many local
projects. Zapper should support careful routing, but the common path should be
small enough that most projects can understand it at a glance.

## Recommended Model

Use one field: `env`.

At the root level, `env` defines the global environment file stack:

```yaml
env: [.env.local, .env.user]
```

Root-level `env_files` remains as a compatibility alias:

```yaml
env_files: [.env.local, .env.user]
```

At the service level, `env` chooses how that service receives environment
variables:

```yaml
env: "*"              # Pass all values from the global env stack
env: [.env.api]       # Replace global env with this service file stack
env: api.env.yaml     # Route global env through this strict whitelist file
```

There is no inline whitelist array in `zap.yaml`. Arrays in `zap.yaml` are file
stacks. Variable allowlists live only in external whitelist files.

This gives Zapper one concept with three levels of power:

1. `env: "*"` for the default local developer.
2. `env: [files...]` for the power user who wants direct file assignment.
3. `env: whitelist.yaml` for the large-team user who needs central storage plus
   explicit routing.

## Resolution Rules

Root `env` and root `env_files` both mean "load these environment files as the
global stack." If both are present, Zapper rejects the config instead of
guessing which one wins.

Service-level `env` resolves as follows:

1. `env: "*"` passes every value from the resolved global env stack.
2. `env: [files...]` loads those files for that service and exposes every value
   from that service stack. This replaces the global stack for that service.
3. `env: path/to/whitelist.yaml` loads a strict whitelist file and exposes only
   the listed variables from the global env stack.
4. Missing `env` means no Zapper-managed env for that service.

The service file-stack rule is an override, not a merge. That keeps precedence
straightforward:

- Root `env` defines the default source.
- Service `env: "*"` uses the default source.
- Service `env: [files...]` replaces the default source.
- Service `env: whitelist.yaml` filters the default source.

Generated Zapper values, such as assigned ports, are part of the resolved
environment source before either `*` or whitelist filtering is applied.

## Persona Stress Test

The model is useful only if it handles the common case without ceremony and
still has credible answers for more demanding setups.

### Persona 1: Default Local Developer

This user has a few services and a manageable number of variables. Most values
are local-only coordination values: ports, local URLs, feature toggles, and
container credentials that are not meaningful outside the dev machine.

They want:

- One obvious place to put shared values.
- One gitignored place to put personal overrides.
- No per-service env bookkeeping.

They should use root `env` and service `env: "*"`:

```yaml
project: myapp

env: [.env.local, .env.user]

native:
  frontend:
    cmd: pnpm dev
    env: "*"

  backend:
    cmd: pnpm dev
    env: "*"

docker:
  postgres:
    image: postgres:15
    env: "*"
```

This is intentionally permissive. It is the right default because local dev
often values alignment more than isolation. The star is visible enough to signal
broad access.

How the model handles it:

- Strong fit.
- Small `zap.yaml`.
- No variable duplication.
- No extra routing files.
- Easy migration path if one service later needs a custom file stack.

### Persona 2: Security-Conscious Power User

This user has enough secrets that they do not want every service receiving the
same gitignored user file. They also prefer ordinary env files over Zapper-owned
whitelist policy.

They want:

- Direct file assignment per service.
- Shared non-sensitive files where useful.
- Separate user secret files for sensitive services.
- No central whitelist registry in `zap.yaml`.

They should use service-level file stacks:

```yaml
project: myapp

native:
  frontend:
    cmd: pnpm dev
    env: [.env.common, .env.frontend, .env.frontend.user]

  backend:
    cmd: pnpm dev
    env: [.env.common, .env.db, .env.backend, .env.backend.user]

  worker:
    cmd: pnpm worker
    env: [.env.common, .env.db, .env.worker, .env.worker.user]
```

This is direct file assignment. The service's `env` array is the source stack
for that service, and all values from that stack are exposed to that service.

How the model handles it:

- Strong fit.
- Security boundaries are represented by file boundaries.
- `zap.yaml` stays readable because it names file stacks rather than individual
  variables.
- The main weakness is that file composition becomes the routing system. If the
  project grows to hundreds or thousands of variables, this can become hard to
  maintain.

### Persona 3: Large-Team Platform Owner

This user has a large environment surface, possibly hundreds or thousands of
variables. Many values need to line up across services. Copying variables into
service-specific files would be risky and tedious.

They want:

- Central env files as the source of truth.
- Explicit routing so services receive only what they need.
- Routing policy outside the core service config.
- A strict schema for routing files.

They should use a global stack and service-level whitelist files:

```yaml
project: enterprise-app

env: [.env.company, .env.local, .env.user]

native:
  frontend:
    cmd: pnpm dev
    env: .zap/env/frontend.yaml

  backend:
    cmd: pnpm dev
    env: .zap/env/backend.yaml

  worker:
    cmd: pnpm worker
    env: .zap/env/worker.yaml
```

With `.zap/env/backend.yaml`:

```yaml
vars:
  - DATABASE_URL
  - REDIS_URL
  - JWT_SECRET
```

This is the most complex setup, but it earns that complexity. The environment
values remain centralized, while routing policy moves into dedicated files that
can be reviewed separately from service definitions.

How the model handles it:

- Good fit for very large projects.
- Avoids copying values across service files.
- Keeps `zap.yaml` from being polluted by long whitelist definitions.
- The complexity is isolated to projects that actually need it.

## Whitelist Files

A service string other than `*` should be interpreted as a whitelist file path,
not a named whitelist embedded in `zap.yaml`.

Whitelist files have a strict schema:

```yaml
vars:
  - DATABASE_URL
  - REDIS_URL
  - JWT_SECRET
```

Rules:

- The top level must be an object.
- `vars` must be an array of non-empty variable names.
- Unknown keys are rejected.
- `*` is not a valid whitelist file path or variable name.
- Whitelist files require a global env stack. If root `env` or `env_files` is
  missing, service `env: some-whitelist.yaml` errors because there is no
  central source to filter.

The last rule is important: a whitelist does not load values. It only selects
values from the global env source.

## Weird Cases

### Root `env` and Root `env_files`

Invalid:

```yaml
env: [.env.local]
env_files: [.env.local]
```

Both fields mean the same thing. Supporting both at once creates unnecessary
precedence rules, so this should be a validation error.

### Service `env: "*"` Without Global Env

Valid, but usually empty unless generated values such as assigned ports exist:

```yaml
native:
  api:
    cmd: pnpm dev
    env: "*"
```

Because `*` means "all currently available values", this produces an empty env
when there is no root env source and no generated values. Whitelist files are
stricter: they require a root env source because they filter central values.

### Service File Stack With Global Env

Valid:

```yaml
env: [.env.local, .env.user]

native:
  api:
    cmd: pnpm dev
    env: [api/.env.local, api/.env.user]
```

The service stack replaces the global stack for this service. It does not merge
with the global stack. Users who want shared values can include the shared file
directly:

```yaml
native:
  api:
    cmd: pnpm dev
    env: [.env.common, api/.env.local, api/.env.user]
```

### Inline Variable Arrays

Invalid:

```yaml
env:
  - DATABASE_URL
  - JWT_SECRET
```

There is no inline whitelist array in `zap.yaml`. A service `env` array is a
file stack, so entries are interpreted as file names or paths. Zapper accepts
ordinary file names such as `.env.something` and `service-env`, but rejects
entries that look like uppercase variable names such as `DATABASE_URL`.
Explicit variable routing belongs in a whitelist file:

```yaml
native:
  api:
    cmd: pnpm dev
    env: .zap/env/api.yaml
```

With `.zap/env/api.yaml`:

```yaml
vars:
  - DATABASE_URL
  - JWT_SECRET
```

### Mixing File Stacks and Whitelist Files

Invalid:

```yaml
native:
  api:
    cmd: pnpm dev
    env: [.env.common, .zap/env/api.yaml]
```

An `env` array is a file stack. A string is a whitelist file path. Mixing those
concepts in one value makes resolution unclear and should be rejected.

## Why This Is the Middle Ground

This is technically three capabilities, but only one needs to be common:

- Common path: root `env`, service `env: "*"`.
- Power-user path: service `env: [files...]`.
- Large-team path: root `env`, service `env: whitelist.yaml`.

The benefit is that all three use one field and one idea:

- Root `env` defines the default source.
- Service `env` defines how the service receives env.
- `*` is shorthand for "all values from the default source."
- A service file stack is an explicit source override.
- A whitelist file filters the default source.

## Current State

The implemented model is:

- Most projects use root `env` and service `env: "*"`.
- Projects with existing env-file conventions use service `env: [files...]`.
- Security-conscious large projects use service `env: whitelist.yaml`.
- Root `env_files` remains a compatibility alias.
- Inline `whitelists` and inline service variable arrays disappear from the
  core YAML spec.
