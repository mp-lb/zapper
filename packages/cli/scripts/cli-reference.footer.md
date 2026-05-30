## JSON Output

Most non-streaming commands support `--json`. Action commands also support JSON
Lines streaming with `--jsonl` where implemented. When `--json` is enabled,
Zapper suppresses incidental human logs and warnings so stdout stays parseable.
Streaming commands (`logs`, `startup-log`, `task`) keep their stream output and
are not JSON-encoded.

For the command result and rendering contract, see [Command Output](output.md).

## System Registry Storage

System commands inspect machine-wide Zapper state rather than only the current
repository. They back desktop integrations, project discovery, and orphaned
resource cleanup.

On macOS, the system registry defaults to
`~/Library/Application Support/Zapper/registry.json`. On Linux, it defaults to
`$XDG_STATE_HOME/zapper/registry.json`, or `~/.local/state/zapper/registry.json`
when `XDG_STATE_HOME` is unset. Set `ZAPPER_SYSTEM_STATE_HOME` to override the
directory, or `ZAPPER_DISABLE_SYSTEM_REGISTRY=1` to disable registry writes.
