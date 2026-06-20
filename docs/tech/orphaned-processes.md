# Orphaned Process Diagnostics

This document is for AI agents to quickly detect and diagnose orphaned process issues caused by zapper.

## Quick Diagnostic Commands

Run these to check for problems:

```bash
# 1. Count zombie zap status polling processes (should be 0 or very few)
ps aux | grep "zapper/packages/cli/dist/index.js status --json" | grep -v grep | wc -l

# 2. Check Zapper's supervisor-backed view of live services
zap global list

# 3. Look for orphaned zap wrapper shells
ps aux | grep ".zap/.*\.sh" | grep -v grep

# 4. Count total node processes (baseline: ~10-20 is normal, 50+ is suspicious)
ps aux | grep "node " | grep -v grep | wc -l

# 5. Check for orphaned project processes not managed by the supervisor
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

**Symptom**: Many `node .../zapper/packages/cli/dist/index.js status --json` processes accumulating.

**Root cause**: The zapper VS Code extension (`zapper-vscode`) polls `zap status --json` every 2 seconds. If a poll takes longer than 2 seconds and overlapping polls aren't prevented, processes stack up. Can also happen if the extension crashes without cleaning up child processes.

**Fix applied**: `zapperProvider.ts` now has an `isPolling` guard that skips polls while one is in-flight. `zapperService.ts` now has a 30s timeout on `executeZapCommand` to kill stuck processes.

**Key files**:
- `~/Code/zapper-vscode/src/zapperProvider.ts` - polling logic (`isPolling` flag)
- `~/Code/zapper-vscode/src/zapperService.ts` - `executeZapCommand()` timeout

### Orphaned child processes after `zap down`

**Symptom**: Processes from a project (tsx watch, vite, next-server, esbuild, pnpm) still running even though the project has no supervisor entries. Often manifests as multiple "generations" of the same process.

**Root cause**: Older process-manager-backed deletion killed the direct child
(the bash wrapper script at `.zap/*.sh`), but grandchildren (pnpm -> tsx ->
node, or pnpm -> vite -> esbuild) could become orphans because signals did not
propagate down the tree.

**Fix applied**: Zapper's native supervisor starts wrappers as detached process groups and kills the supervised process group on stop, restart, delete, and cleanup.

**Key file**: `~/Code/zapper/packages/sdk/src/core/process/NativeProcessManager.ts`

### Orphans from deleted checkouts / instance dirs

**Symptom**: Processes running from a directory that no longer exists (e.g. a
removed worktree under `~/Code/__instances__/`), sometimes holding ports.

**Root cause**: Deleting a checkout does not stop processes that were started
from that checkout. Older process-manager-backed versions could also leave registrations
that restarted missing wrapper scripts forever.

**Fix applied**: `zap gprune` detects and kills supervisor entries whose
working directory no longer exists and unmanaged wrapper survivors whose
`.zap/*.sh` script is gone. Dash stops a checkout's zapper stacks (`zap down`
per stack) before removing an instance.

### Crash loops from stale registrations (the cap that didn't apply)

**Symptom**: A supervised app whose `.zap` wrapper script was deleted restarts
repeatedly.

**Root cause**: The wrapper script is gone, so bash exits immediately.

**Fix applied**: Registrations whose wrapper script is gone are deregistered
instead of restarted (`zap restart`, the system audit/`gprune`, and the
post-recovery sweep). The supervisor caps fresh crash loops and throttles later
crash loops with exponential backoff.

### Supervisor daemon restarts leaving orphaned processes

**Root cause**: If the supervisor daemon exits without terminating a process
tree, the tree can survive reparented to launchd, hold its port, and block later
starts of that service.

**Fix applied**: recovery terminates surviving wrapper trees (SIGTERM then
SIGKILL) and sweeps registrations whose scripts are missing. Survivors that
exec'd past their wrapper are detected by port: `zap global list` reports
processes listening on zap-assigned ports that belong to no supervisor-managed
tree, and `gprune` kills them.

### Misleading "No log file found ... may never have started"

**Root cause**: Older process-manager-backed versions did not always write the expected
managed log file. The log path was also shared between stacks, so an isolated
profile's cleanup deleted the default stack's log.

**Fix applied**: Managed log files are written by the supervisor and
stack-namespaced: `.zap/logs/<project>.<stackId>.<service>.log`.

## Cleanup Commands

If orphaned processes are detected, clean them up:

```bash
# Kill zombie status pollers
pkill -f "zapper/packages/cli/dist/index.js status --json"

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

# Verify Zapper's supervisor-backed view after cleanup
zap global list
```

## Architecture Notes

- Zapper uses its native supervisor to manage processes. Each process is wrapped in a bash script at `.zap/<project>.<process>.<timestamp>.sh`
- The wrapper script sets PATH, redirects stderr with coloring, and `exec`s the actual command
- Zapper configures the supervisor with `autorestart: true`, `maxRestarts: 2` for fast feedback on fresh registrations, and `restartBackoffMs: 100` to throttle late-onset crash loops.
- The process tree typically looks like: supervisor -> bash wrapper -> pnpm -> tsx/vite/next -> node/esbuild
- The supervisor starts wrappers as detached process groups so cleanup can signal the process group.
- The VS Code extension spawns 5 commands per project per poll cycle: `status --json`, `task --json`, `profile list --json`, `state`, `config --pretty`
