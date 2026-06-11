# Orphaned Process Diagnostics

This document is for AI agents to quickly detect and diagnose orphaned process issues caused by zapper.

## Quick Diagnostic Commands

Run these to check for problems:

```bash
# 1. Count zombie zap status polling processes (should be 0 or very few)
ps aux | grep "zapper/packages/cli/dist/index.js status --json" | grep -v grep | wc -l

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

**Symptom**: Many `node .../zapper/packages/cli/dist/index.js status --json` processes accumulating.

**Root cause**: The zapper VS Code extension (`zapper-vscode`) polls `zap status --json` every 2 seconds. If a poll takes longer than 2 seconds and overlapping polls aren't prevented, processes stack up. Can also happen if the extension crashes without cleaning up child processes.

**Fix applied**: `zapperProvider.ts` now has an `isPolling` guard that skips polls while one is in-flight. `zapperService.ts` now has a 30s timeout on `executeZapCommand` to kill stuck processes.

**Key files**:
- `~/Code/zapper-vscode/src/zapperProvider.ts` - polling logic (`isPolling` flag)
- `~/Code/zapper-vscode/src/zapperService.ts` - `executeZapCommand()` timeout

### Orphaned child processes after `zap down`

**Symptom**: Processes from a project (tsx watch, vite, next-server, esbuild, pnpm) still running even though the project has no PM2 entries. Often manifests as multiple "generations" of the same process.

**Root cause**: When `Pm2Manager.deleteProcess()` runs `pm2 delete <name>`, PM2 kills the direct child (the bash wrapper script at `.zap/*.sh`), but grandchildren (pnpm -> tsx -> node, or pnpm -> vite -> esbuild) become orphans because signals don't propagate down the tree.

**Fix applied**: `Pm2Manager` now has `killProcessTree()` and `killManagedProcessTree()` methods that kill the entire process tree (using process group signals and `pgrep -P` traversal) before running `pm2 delete/stop`.

**Key file**: `~/Code/zapper/packages/cli/src/core/process/Pm2Manager.ts`

### Orphans from deleted checkouts / instance dirs

**Symptom**: Processes running from a directory that no longer exists (e.g. a
removed worktree under `~/Code/__instances__/`), sometimes holding ports.

**Root cause**: Deleting a checkout does not stop its PM2-managed processes —
PM2 is a user-global daemon. The leftover PM2 entry then restarts the missing
wrapper script forever, error-spamming `~/.pm2/pm2.log`. In June 2026 this
grew the log to 20GB, filled the disk, and crashed the PM2 daemon (ENOSPC). A
daemon crash empties PM2's process table without killing anything: every
managed process becomes an unmanaged orphan, and `zap ps` reports services
DOWN while they still run and hold ports.

**Fix applied**: `zap gprune` now detects and kills both PM2 entries whose
working directory no longer exists and unmanaged wrapper survivors whose
`.zap/*.sh` script is gone. Dash stops a checkout's zapper stacks (`zap down`
per stack) before removing an instance.

### Crash loops from stale registrations (the cap that didn't apply)

**Symptom**: A PM2 app whose `.zap` wrapper script was deleted restarts
unbounded (~270/sec observed), even though Zapper registers apps with
`max_restarts: 2`.

**Root cause**: PM2 only counts "unstable" restarts within
`min_uptime * max_restarts` of `created_at`, and `created_at` is never reset
by restarts (pm2 7.0.1, `God.js handleExit`). An app that starts instant-
exiting *later in life* — its script deleted long after registration — never
trips the cap. Fresh registrations crash inside the window and stop normally,
which is why the cap appears to work in testing.

**Fix applied**: three layers. Registrations whose wrapper script is gone are
deregistered instead of restarted (`zap restart`, the system audit/`gprune`,
and the post-recovery sweep). Ecosystems set `exp_backoff_restart_delay: 100`,
which throttles any remaining loop to one restart per 15s and resets once the
app runs stably. `zap reset` deregisters every PM2 app under `.zap` (all
stacks/instances) before deleting the directory.

### PM2 daemon kills taking down every project

**Root cause**: Zapper's PM2 corruption/version-mismatch recovery ran a bare
`pm2 kill`, which stops every project's apps at once. Worse, a kill can fail
to terminate a process tree (observed with the mgr terminal-daemon): the tree
survives reparented to launchd, holds its port, and every later start of that
service fails with "port already in use" while PM2 shows it errored.

**Fix applied**: recovery now snapshots the process table (`pm2 save
--force`), kills the daemon, terminates surviving wrapper trees (SIGTERM then
SIGKILL), resurrects the snapshot so other projects come back, and sweeps
registrations whose scripts are missing. Survivors that exec'd past their
wrapper are detected by port: `zap global list` reports processes listening on
zap-assigned ports that belong to no PM2-managed tree, and `gprune` kills
them.

### Misleading "No log file found ... may never have started"

**Root cause**: PM2 7 ignores the ecosystem `log` attribute, so the managed
log file in `.zap/logs/` was never written; once a PM2 entry disappeared
(daemon crash, delete), `zap logs` claimed the service never started. The log
path was also shared between stacks, so an isolated profile's cleanup deleted
the default stack's log.

**Fix applied**: ecosystems use `out_file`/`error_file`, and managed log files
are stack-namespaced: `.zap/logs/<project>.<stackId>.<service>.log`.

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

# Verify PM2 is still healthy after cleanup
pm2 list
```

## Architecture Notes

- Zapper uses PM2 to manage processes. Each process is wrapped in a bash script at `.zap/<project>.<process>.<timestamp>.sh`
- The wrapper script sets PATH, redirects stderr with coloring, and `exec`s the actual command
- Zapper configures PM2 with `autorestart: true`, `max_restarts: 2` for fast feedback on fresh registrations, and `exp_backoff_restart_delay: 100` to throttle late-onset crash loops the cap cannot stop (see above)
- The process tree typically looks like: PM2 -> bash wrapper -> pnpm -> tsx/vite/next -> node/esbuild
- When PM2 kills a process, only the bash wrapper receives the signal. Children must be killed explicitly.
- The VS Code extension spawns 5 commands per project per poll cycle: `status --json`, `task --json`, `profile list --json`, `state`, `config --pretty`
