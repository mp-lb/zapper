# Zapper for macOS

Native macOS menu bar app for the local Zapper system view.

The app uses a bundled Zapper CLI runtime and reads `zap system projects --json`.
It does not read `.zap` state or `zap.yaml` files directly.

The dashboard lists stacks. The default stack shows as the project name;
profile-owned stacks show as `myproj (test)`. Stack rows show a running-service
summary with a small status
LED and expose start, stop, and Open actions. Pinning lives in the stack
overflow menu. The Open control is hidden
when no homepage or project links are configured, opens directly when there is
one target, and becomes a menu when there are multiple targets. The menu bar
status item shows the bolt icon plus the count of running services only, keeping
the item compact. Pinned stacks
are stored as a local app preference and appear in a Pinned section above
unpinned stacks. Missing registry entries appear as one compact, expandable
warning with a Prune button. Clicking Prune replaces the warning with an inline
destructive confirmation; accepting runs `zap global prune`. Unpinned stacks are grouped into Active and Inactive sections
using the same state as the stack LED: running, pending, or errored stacks are
active; gray LED stacks are inactive. Expanding a stack groups services by
native and Docker runtime. Service start, stop, and restart controls live in
each service overflow menu. Start, stop, and restart actions show immediate
stale-state feedback in the stack and service rows, then converge on the next
real CLI refresh. While one stack action is running, actions on unrelated stacks
remain available; only the affected stack or service is held busy. Amber LEDs
are reserved for real CLI-reported pending state; the spinner means the app
knows the displayed state is stale. The open popover
polls briefly at a faster cadence, settles to a slower idle cadence, polls at
least every 8 seconds while closed, and polls more frequently while action state
is stale. During refresh, the header keeps showing the last service summary and
uses a fixed-size spinner/check indicator to avoid layout shifts. The popover
uses the native macOS popover material and grows to fit its content until it
reaches a capped height, then scrolls.

## Build

```bash
apps/macos/bin/build
```

The build script uses `swiftc` and creates:

```text
apps/macos/build/Zapper.app
```

No Xcode project is required for this first version.

By default the build also packages a local Node runtime, the built CLI from
`packages/cli/dist`, production CLI dependencies, and PM2 into
`Contents/Resources/ZapperRuntime`. Run `pnpm --filter @mp-lb/zapper build`
before building the app. Set `PACKAGE_ZAPPER_RUNTIME=0` to skip runtime
packaging for a development-only build.

Local builds use ad-hoc signing by default. To sign with a Developer ID
certificate already installed in your keychain, pass its identity explicitly:

```bash
CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
CODESIGN_OPTIONS=runtime \
apps/macos/bin/build
```

The build signs the app and nested runtime binaries with
`apps/macos/Signing/Zapper.entitlements`. Those entitlements are required for
the bundled Node/V8 runtime under Apple's hardened runtime.

## Run

```bash
apps/macos/bin/run
```

Release builds prefer the bundled `zap` wrapper, which runs the bundled CLI with
the bundled Node runtime. If you need to test against an external CLI, set
`ZAPPER_CLI_PATH` before running the app, or open the gear menu in the app and
choose an external executable from Settings.
