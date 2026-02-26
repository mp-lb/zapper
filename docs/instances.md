# Instances (Git Worktrees)

When the same project exists in multiple directories (typically via git worktrees), Zapper can accidentally share PM2 processes and Docker containers across those directories. That can cause one directory's `zap up` to clobber another, and `zap status`/`zap logs` to report the wrong instance.

---

## Initialization Behavior

Use `zap init` to initialize local metadata in `.zap/state.json`.

- `zap init` initializes the directory as the main (non-isolated) instance.
- `zap init -i` initializes the directory as an isolated instance.
- `zap init -R` re-randomizes all configured ports.

If you run `zap init` in a git worktree without `-i`, Zapper prints a warning and keeps the directory non-isolated.

---

## Isolation

Use isolated mode for worktrees so process/container names are namespaced:

- PM2: `zap.<project>.<instanceId>.<service>`
- Docker: `zap.<project>.<instanceId>.<service>`

This prevents collisions with other worktrees of the same project.

Example:

```bash
zap init -i
zap up
```

---

## Port Assignment

`zap init` also initializes configured `ports:` values in `.zap/state.json`.

Behavior:

- Existing keys stay unchanged (idempotent).
- New keys get newly assigned random ports.
- Removed keys are deleted from saved state.
- `zap init -R` re-randomizes all configured port keys.

---

## State File

Zapper stores initialization metadata in `.zap/state.json`:

```json
{
  "instanceId": "a1b2c3",
  "mode": "isolate",
  "ports": {
    "FRONTEND_PORT": "54321"
  }
}
```

---

## Summary

| Scenario | What happens |
|----------|-------------|
| Normal repo, `zap init` | Main mode initialized; ports initialized |
| Worktree, `zap init` | Warning shown; stays non-isolated |
| Worktree, `zap init -i` | Isolated mode enabled in `.zap/state.json` |
| Re-run `zap init` after port changes | Existing kept, removed deleted, new assigned |
| `zap init -R` | All configured ports are re-randomized |
