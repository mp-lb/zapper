## Development

Create example projects for testing:

```
./packages/cli/examples/myproj/zap.yaml
```

Remember to `pnpm build` and link (usually already linked). Then cd into the example project and zap away.

**Cleanup:** Stop processes and delete `.zap` folders when done.

### Local tool versions

Mise is the base layer: it selects Node and the package manager. Zapper runs tasks and services on top of those tools. Run `mise trust` and `mise install` for checkout setup, then use an activated mise shell or `mise exec -- zap task <task>`.

Read Node from `.node-version` and pnpm from `package.json#packageManager`; `mise.toml` reads these pins rather than duplicating them. npm projects use npm bundled with Node. Preserve the project's versions and package manager. Keep locally built CLI entrypoints in a version-independent PATH directory so switching Node does not hide `zap` or `fm`.
