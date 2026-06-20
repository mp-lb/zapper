# Profiles

Profiles are Zapper's primary runtime selection model. They combine env file
selection, service selection, and stack isolation into one named configuration.

## Model

Profiles describe how a stack runs.

```yaml
profiles:
  default:
    env_files: [.env.local, .env]
    services: "*"
    isolate: false

  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: [thing, thang, thong]
    isolate: true
```

A profile answers three questions:

- Which env files are loaded?
- Which services are active?
- Should this profile run as an isolated stack?

This replaces the legacy product shape where users had to understand and
coordinate separate environment sets, service profiles, and instances.

## Legacy Model

Before the profile-first migration, Zapper had three separate selectors:

- Root `env` / `env_files` can be a named map of env file sets.
- Service-level `profiles` decide whether individual services are enabled.
- Instances decide which runtime namespace a command controls.

Each selector is useful, but together they create too much surface area:

```bash
zap env proddata
zap profile api
zap up --instance e2e
```

The product problem is not that any individual concept is wrong. The problem is
that users must compose them manually, and automation must avoid sticky state
across multiple axes.

## Profile Model

The user-facing model is:

```text
profile = env files + service selection + isolation behavior
```

Examples:

```bash
zap profile use default
zap up

zap --profile e2e up
zap --profile e2e down
```

Sticky selection remains useful for humans:

```bash
zap profile use proddata
zap up
```

Explicit flags are the expected automation shape:

```bash
zap --profile e2e up
zap --profile e2e test
zap --profile e2e down
```

An explicit `--profile` flag overrides the selected profile for that invocation
without mutating saved state.

## Config Shape

The top-level schema is:

```yaml
project: myapp

profiles:
  default:
    env_files: [.env.local, .env]
    services: "*"
    isolate: false

  proddata:
    env_files: [.env.local, .env.proddata, .env]
    services: "*"
    isolate: false

  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: [api, worker, postgres, browser]
    isolate: true

native:
  api:
    cmd: pnpm dev
    env: "*"

  worker:
    cmd: pnpm worker
    env: "*"

docker:
  postgres:
    image: postgres:15
    env: "*"
```

### `env_files`

`env_files` is the profile's root env file stack.

Files are resolved relative to `zap.yaml`. Later files override earlier files.

### `services`

`services` selects the services that belong to the profile.

Allowed forms:

```yaml
services: "*"                  # All configured services
services: [api, worker, db]    # Only named services
```

The service list uses canonical service names. Aliases remain command-line
convenience names, not config identity.

When a selected service declares `depends_on`, its dependencies are included in
the active profile automatically, even if they are not listed directly. For
example, `services: [api]` also includes `postgres` when `api` has
`depends_on: [postgres]`.

### `isolate`

`isolate` controls whether the profile gets its own stack.

```yaml
isolate: false
```

The profile applies to the default stack in this local copy. Switching between
non-isolated profiles changes what the current stack should look like.

```yaml
isolate: true
```

The profile runs as a separate stack in this local copy and can coexist with
non-isolated profiles.

## Isolation Behavior

The important product distinction is:

- Non-isolated profiles are modes of the same local stack.
- Isolated profiles are separate running copies of the stack.

For example:

```yaml
profiles:
  default:
    env_files: [.env.local, .env]
    services: "*"
    isolate: false

  proddata:
    env_files: [.env.local, .env.proddata, .env]
    services: "*"
    isolate: false

  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: [api, worker, postgres, browser]
    isolate: true
```

Switching from `default` to `proddata` updates the same local stack. Zapper
hot-swaps non-isolated profiles by saving the selected profile, ensuring the
new profile's services are running, and leaving shared services alone.

If the previous profile included services that the new profile no longer needs,
Zapper prompts before stopping them. Press Enter to accept the default cleanup,
or pass `--force` to skip the prompt. `--json` and `--jsonl` do not prompt.

Starting `e2e` does not disturb `default` or `proddata`. It uses an isolated
stack derived from the profile.

## Local Copies, Stacks, and Stack IDs

Use precise vocabulary:

```text
local copy = one checkout / project root on this machine
profile    = named way to run the stack
stack      = one running namespace produced by a profile
stackId    = internal/random ID for that stack
```

A machine can have multiple local copies of the same Zapper project. Each local
copy can have multiple stacks if isolated profiles have been used.

Example:

```text
/Users/me/app       default profile -> stackId abc123
/Users/me/app       e2e profile     -> stackId def456
/Users/me/app-copy  default profile -> stackId ghi789
/Users/me/app-copy  e2e profile     -> stackId jkl012
```

For non-isolated profiles, the stack is the shared default stack in the local
copy. For isolated profiles, the stack is profile-owned.

Normal command output should avoid opaque IDs:

```text
== MyProject ==
== MyProject [e2e] ==
== MyProject [abc123 - 3 stacks] ==
== MyProject [e2e - abc123 - 3 stacks] ==
```

If a user needs the internal ID, use the explicit stack command instead of
ordinary headers. Ordinary status output should only include the `stackId` when
it disambiguates multiple known stacks:

```bash
zap stack id
zap stack current
zap stack list
```

JSON and extended/debug output can include `stackId`, profile, project root,
and local-copy count.

## State File

The `.zap/state.json` file uses stack vocabulary:

```json
{
  "selectedProfile": "default",
  "stacks": {
    "default": {
      "stackId": "abc123",
      "profile": "default",
      "ports": {
        "API_PORT": "54321"
      },
      "volumes": {}
    },
    "e2e": {
      "stackId": "def456",
      "profile": "e2e",
      "ports": {
        "API_PORT": "61234"
      },
      "volumes": {}
    }
  },
  "lastUpdated": "2026-05-19T00:00:00.000Z"
}
```

`selectedProfile` is sticky human state. `stacks.default` is the shared
non-isolated stack. Isolated profiles get their own stack entries, normally
keyed by profile name. `stackId` replaces the old random instance ID term.

For a non-isolated profile switch, the default stack records the profile that is
currently materialized there:

```json
{
  "selectedProfile": "proddata",
  "stacks": {
    "default": {
      "stackId": "abc123",
      "profile": "proddata",
      "ports": {},
      "volumes": {}
    }
  }
}
```

The global registry tracks local copies across the machine. Local
`.zap/state.json` tracks stacks inside the current local copy.

## CLI Shape

Primary commands:

```bash
zap profile list
zap profile current
zap profile use <name>
zap profile reset
```

Stack-targeting commands accept `--profile`:

```bash
zap --profile default up
zap --profile proddata restart
zap --profile e2e status
zap --profile e2e logs api
zap --profile e2e down
```

A profile is the named env/service/isolation selection; a stack is the runtime
namespace produced by that selection.

Rules:

- `zap profile use <name>` updates saved state.
- `zap --profile <name> <command>` overrides saved state for one invocation.
- `--profile` does not mutate saved state.
- Stack commands show the selected profile in human output when useful.
- JSON output includes the resolved profile name and stack metadata.

Advanced instance flags can remain internal or be reintroduced later, but the
main docs do not require users to learn instances.

## Migration

No backward compatibility is required for this migration.

### Environment sets

Before:

```yaml
env:
  default: [.env.local, .env]
  proddata: [.env.local, .env.proddata, .env]
```

After:

```yaml
profiles:
  default:
    env_files: [.env.local, .env]
    services: "*"
    isolate: false

  proddata:
    env_files: [.env.local, .env.proddata, .env]
    services: "*"
    isolate: false
```

Before:

```bash
zap env proddata
zap up
```

After:

```bash
zap profile use proddata
zap up
```

For automation:

```bash
zap --profile proddata up
```

### Service-level profiles

Before:

```yaml
native:
  api:
    cmd: pnpm dev
    profiles: [dev, e2e]

  browser:
    cmd: pnpm test:browser
    profiles: [e2e]
```

After:

```yaml
profiles:
  dev:
    env_files: [.env.local, .env]
    services: [api]
    isolate: false

  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: [api, browser]
    isolate: true

native:
  api:
    cmd: pnpm dev

  browser:
    cmd: pnpm test:browser
```

Service membership moves out of each service and into the profile definition.
This makes each profile readable as a complete stack mode.

### Instances

Before:

```bash
zap up --instance e2e
zap down --instance e2e
```

After:

```yaml
profiles:
  e2e:
    env_files: [.env.local, .env.e2e, .env]
    services: "*"
    isolate: true
```

```bash
zap --profile e2e up
zap --profile e2e down
```

Instances become an implementation detail of isolated profiles.

## Implementation Notes

Zapper does not run the old and new product models side by side. The old
surface-level selectors were removed and the reusable env/service/stack
mechanics were wired into the profile model.

The runtime invariant is:

```text
Every stack command runs against a resolved profile.
```

A resolved profile contains:

```ts
{
  name: string;
  envFiles: string[];
  services: "*" | string[];
  isolate: boolean;
}
```

Runtime names, native process names, Docker names, and name parsing are core Zapper
mechanics and stay outside the profile migration except where existing runtime
code consumes the selected profile.

## Current Status

- Top-level `profiles` are supported in `zap.yaml`.
- Root named env sets are removed; root `env` and `env_files` are file stacks.
- Service-level `profiles` are removed.
- `zap env <service>` inspects resolved environment variables and no longer
  switches state.
- `zap profile use <name>` updates `selectedProfile`.
- `zap --profile <name> <command>` is a one-command override and does not
  mutate state.
- Isolated profiles create or reuse profile-owned stacks.
- `zap stack id`, `zap stack current`, and `zap stack list` expose `stackId`
  explicitly.
- Normal status headers avoid opaque IDs unless they disambiguate multiple
  known stacks.

## Defaults

- Missing `profiles` keeps the historical single-stack behavior with root
  `env` / `env_files`.
- Profile `env_files` defaults to an empty stack.
- Profile `services` defaults to `"*"`.
- Profile `isolate` defaults to `false`.
- Use `services: "*"` for ordinary local development profiles.
- Use `isolate: true` for E2E, CI, PR, and destructive test profiles.
- Keep instance terminology out of the happy-path docs. Prefer local copy,
  profile, stack, and stackId.
