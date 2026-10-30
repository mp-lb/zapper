# Local runtime compatibility

Zapper is published as the npm package `@mp-lb/zapper`. Its executable uses
Node.js from the user's environment via `#!/usr/bin/env node`.

Project commands run in the user's project environment and may require
`node`, `pnpm`, `npm`, `docker`, language toolchains, or local shims.

## Project command environments

If a service has this configuration:

```yaml
native:
  web:
    cmd: pnpm dev
```

then `pnpm dev` should still run in the user's project environment. Zapper
should preserve or reconstruct a useful shell environment for those commands.
That is separate from the runtime used to execute Zapper itself.

Zapper can make that project-command environment explicit by autodetecting
`mise.toml`, `.mise.toml`, or `.tool-versions`. When exactly one runtime file is
present, native supervisor wrapper scripts execute the service command through
`mise exec`. If multiple runtime files are present, Zapper falls back to the
previous captured-`PATH` behavior and reports the ambiguity in `zap runtime`.
Projects can still set `runtime.provider` explicitly as an escape hatch.

For projects without mise, `runtime.provider: shell` reconstructs a
login-shell-derived environment: at `zap up`, the CLI spawns the user's shell
(`$SHELL`, or `runtime.shell`) once as a login + interactive shell, captures
its environment, and bakes it into the supervisor wrapper scripts. This is the same
approach as VS Code's shell environment resolution, and lets services use
nvm-installed node or other rc-file-initialized tools. Restarting through
Zapper regenerates the wrapper with a fresh capture, so the environment does
not stay frozen at an earlier `zap up`. If capture fails, or on native
Windows, Zapper warns and falls back to ambient behavior.

With `ambient` (the default), the CLI captures the launch environment used for
`zap up` and writes supervisor wrapper scripts with that `PATH` — useful from a
terminal, but only as good as the environment `zap` inherited.

## Native Supervisor

Native services are managed by Zapper's own local supervisor daemon. The
supervisor starts wrapper scripts as detached process groups, records state under
`~/.zapper/supervisor`, writes combined logs under each project's `.zap/logs`,
and exposes the process list back to the CLI.

The native supervisor supports macOS, Linux, and WSL2. Native Windows process
supervision is intentionally unsupported; run Zapper from WSL2 on Windows.

The supervisor preserves the behavior Zapper needs for local development:

- detached services keep running after the invoking terminal exits;
- native services use one managed log file per service and stack;
- native service logs are cleared when a new run starts and left in place when
  the service stops;
- stop, restart, delete, and global cleanup kill the supervised process group;
- fast crash loops are capped, and later crash loops are throttled with
  exponential backoff;
- missing `.zap` wrapper registrations are removed instead of restarted.

Runtime executable lookup is centralized behind platform adapters in the CLI.
Docker, shell wrappers, log tailing, and URL opening are resolved through the
same boundary instead of scattering `process.platform` checks across command
implementations.
