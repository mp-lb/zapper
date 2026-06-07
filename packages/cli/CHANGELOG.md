# @mp-lb/zapper

## 0.19.0

### Minor Changes

- 9bd9b7d: Accept kebab-case config keys in `zap.yaml`. Multi-word keys (`env-files`,
  `init-task`, `git-method`, `task-delimiters`, `depends-on`, `internal-dir`,
  `read-only`) may now be written in kebab-case as well as snake_case; both are
  normalized to the canonical form before validation. User-chosen names
  (processes, containers, tasks, volumes, secrets, profiles) are never rewritten.

## 0.18.1

### Patch Changes

- Support Docker command overrides as either friendly strings or exact argument arrays, and add best-effort CLI command analytics.

## 0.18.0

### Minor Changes

- Make readiness waits explicit: services without a healthcheck now report as up immediately, dependency waves only wait for dependencies with healthchecks, profiles include transitive dependencies automatically, and healthcheck config now supports explicit delay and HTTP objects with polling controls.

## 0.17.0

### Minor Changes

- Add bundled runtime command resolution for PM2 and host tools, improve cross-platform launch/open behavior, and update release/deploy workflows.

## 0.16.1

### Patch Changes

- Fix profile reset CLI output and type-only exports for release builds.

## 0.16.0

### Minor Changes

- f379113: Add project open targets, structured action result reporting, JSON validation output, and stale registry pruning support.
