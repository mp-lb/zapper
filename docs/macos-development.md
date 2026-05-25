# macOS Development

The native menu bar app lives in `apps/macos`. You do not need Xcode for the
normal local loop.

## Fast Local Loop

Build the CLI, rebuild the app bundle, stop any running Zapper app, and launch
the freshly built development app:

```bash
pnpm --filter @mp-lb/zapper build
apps/macos/bin/run
```

`apps/macos/bin/run` calls `apps/macos/bin/build`, kills running `Zapper`
processes, then opens `apps/macos/build/Zapper.app`.

Use this when the production app is already running and you want the menu bar
app you see to be the local build.

## Useful Commands

```bash
apps/macos/bin/build   # Build apps/macos/build/Zapper.app
apps/macos/bin/run     # Build, stop running Zapper apps, start the local app
apps/macos/bin/clean   # Remove apps/macos/build
```

CLI npm release publishing is handled by `.github/workflows/release.yml` using
the `NPM_TOKEN` value from `proj/secrets.txt.enc`. The macOS app release
workflow is separate and starts from pushed `v*` tags after the CLI package
version is final.

By default the app build packages the built CLI, Node runtime, production CLI
dependencies, and PM2 into the app bundle. If you only changed Swift code and
want a faster local-only build, you can skip runtime packaging:

```bash
PACKAGE_ZAPPER_RUNTIME=0 apps/macos/bin/run
```

## Notes

- The app shells out to its bundled `zap` wrapper for `zap system projects
  --json`, links, and start/stop/restart actions.
- Use the gear menu to choose an external CLI only when debugging CLI selection.
- If the popover still looks stale, open the app menu and refresh after launch.
