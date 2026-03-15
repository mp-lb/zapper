# Instances

Zapper is instance-first. A project can have multiple stack instances, and each instance has:

- Its own random `id` (used in PM2/Docker names)
- Its own assigned `ports` map

This prevents collisions across worktrees and also supports multiple stacks from one repo (for example, E2E runs).

## Defaults

- If `--instance` is omitted, Zapper resolves the default instance key from `state.json` (`defaultInstance`, fallback: `default`).
- Instance keys must contain lowercase letters and hyphens only.

## Initialization

- `zap up` auto-creates the target instance if missing.
- `zap init` creates/updates the selected instance idempotently.
- `zap init -R` re-randomizes all configured ports for the selected instance.
- Commands other than `zap up` fail if the target/default instance does not exist yet.

Examples:

```bash
zap up
zap up --instance e2e
zap init --instance e2e
```

## Naming

PM2 and Docker names are always namespaced:

- `zap.<project>.<instanceId>.<service>`

## State file

Zapper stores instance state in `.zap/state.json`:

```json
{
  "defaultInstance": "default",
  "instances": {
    "default": {
      "id": "a1b2c3",
      "ports": {
        "FRONTEND_PORT": "54321"
      }
    },
    "e2e": {
      "id": "k9m2pq",
      "ports": {
        "FRONTEND_PORT": "61234"
      }
    }
  }
}
```
