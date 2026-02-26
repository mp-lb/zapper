# Orphaned Process Diagnostics

This document is for AI agents to quickly detect and diagnose orphaned process issues caused by zapper.

## Quick Diagnostic Commands

Run these to check for problems:

```bash
# 1. Count zombie zap status polling processes (should be 0 or very few)
ps aux | grep "zapper/dist/index.js status --json" | grep -v grep | wc -l

# 2. Check for orphaned processes from projects not in PM2
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
managed = {p['name'] for p in data}
print('PM2-managed processes:', managed)
"

# 3. Look for orphaned zap wrapper shells (these should only exist for running PM2 processes)
ps aux | grep ".zap/.*\.sh" | grep -v grep

# 4. Count total node processes (baseline: ~10-20 is normal, 50+ is suspicious)
ps aux | grep "node " | grep -v grep | wc -l

# 5. Check for orphaned project processes not managed by PM2
# Replace PROJECT with project names like orb0, heidi, lexiquest, hyperdoc
for PROJECT in orb0 heidi lexiquest hyperdoc; do
  COUNT=$(ps aux | grep "$PROJECT" | grep -v grep | grep -v ".cursor" | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 0 ]; then
    echo "$PROJECT: $COUNT processes"
  fi
done
```

## What To Look For

### Zombie `zap status --json` processes

**Symptom**: Many `node .../zapper/dist/index.js status --json` processes accumulating.

**Root cause**: The zapper VS Code extension (`zapper-vscode`) polls `zap status --json` every 2 seconds. If a poll takes longer than 2 seconds and overlapping polls aren't prevented, processes stack up. Can also happen if the extension crashes without cleaning up child processes.

**Fix applied**: `zapperProvider.ts` now has an `isPolling` guard that skips polls while one is in-flight. `zapperService.ts` now has a 30s timeout on `executeZapCommand` to kill stuck processes.

**Key files**:
- `~/Code/zapper-vscode/src/zapperProvider.ts` - polling logic (`isPolling` flag)
- `~/Code/zapper-vscode/src/zapperService.ts` - `executeZapCommand()` timeout

### Orphaned child processes after `zap down`

**Symptom**: Processes from a project (tsx watch, vite, next-server, esbuild, pnpm) still running even though the project has no PM2 entries. Often manifests as multiple "generations" of the same process.

**Root cause**: When `Pm2Manager.deleteProcess()` runs `pm2 delete <name>`, PM2 kills the direct child (the bash wrapper script at `.zap/*.sh`), but grandchildren (pnpm -> tsx -> node, or pnpm -> vite -> esbuild) become orphans because signals don't propagate down the tree.

**Fix applied**: `Pm2Manager` now has `killProcessTree()` and `killManagedProcessTree()` methods that kill the entire process tree (using process group signals and `pgrep -P` traversal) before running `pm2 delete/stop`.

**Key file**: `~/Code/zapper/src/core/process/Pm2Manager.ts`

## Cleanup Commands

If orphaned processes are detected, clean them up:

```bash
# Kill zombie status pollers
pkill -f "zapper/dist/index.js status --json"

# Kill orphaned processes for a specific project (e.g., orb0)
pkill -f "orb0/.zap/"
pkill -f "orb0-backend dev"
pkill -f "orb0-worker dev"
pkill -f "orb0-frontend"
pkill -f "orb0.*tsx.*watch"
pkill -f "orb0.*esbuild"
pkill -f "orb0.*vite"

# Nuclear option: kill all orphaned zap wrapper shells
pkill -f ".zap/.*\.sh"

# Verify PM2 is still healthy after cleanup
pm2 list
```

## Architecture Notes

- Zapper uses PM2 to manage processes. Each process is wrapped in a bash script at `.zap/<project>.<process>.<timestamp>.sh`
- The wrapper script sets PATH, redirects stderr with coloring, and `exec`s the actual command
- Zapper configures PM2 with `autorestart: true` but limits `max_restarts: 2` for faster feedback in local development
- The process tree typically looks like: PM2 -> bash wrapper -> pnpm -> tsx/vite/next -> node/esbuild
- When PM2 kills a process, only the bash wrapper receives the signal. Children must be killed explicitly.
- The VS Code extension spawns 5 commands per project per poll cycle: `status --json`, `task --json`, `profile --list --json`, `state`, `config --pretty`
