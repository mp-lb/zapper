<!--
  This file is the hand-authored header for docs/commands.md.
  The command reference below it is generated from the Zapper command tree.
  Do not edit docs/commands.md by hand — edit this header (or the commands in
  packages/cli/src/cli/CommanderCli.ts) and run:
    pnpm --filter @mp-lb/zapper docs:gen
-->

# Commands

Zapper commands operate on the current project by default. Use `--config` to
point at a specific config file, `--profile <name>` for a one-off profile
override, and `--instance <name>` to target a named instance.

The reference below is generated from the commander command tree, so it always
matches `zap <command> --help`. See [Tasks](tasks.md) for task configuration,
[Configuration](configuration.md) for `zap.yaml` fields, and
[Command Output](output.md) for the JSON/result contract.

`zap logs` delegates to the underlying runtime log command for running services.
Native service logs are shown without supervisor metadata prefixes. If a native
service is stopped, Zapper can still show the saved last-run log.
