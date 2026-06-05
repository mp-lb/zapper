# Project Roots

This is an internal note for reasoning about Zapper project identity, especially
for the system registry.

## Definition

A Zapper project root is the directory that contains the resolved config file.

In code:

```text
configPath = resolveConfigPath(...)
projectRoot = dirname(realpath(configPath))
```

Zapper does not first discover a Git repository root or package workspace root.
The selected config file defines the Zapper project boundary.

## Default Config Discovery

When no `--config` value is passed, Zapper searches upward from the current
working directory for:

1. `zap.yaml`
2. `zap.yml`

The nearest matching directory wins. Within the same directory, `zap.yaml` wins
over `zap.yml`.

Example:

```text
repo/
  zap.yaml
  apps/
    api/
      zap.yaml
```

Running `zap status` from `repo/apps/api` uses `repo/apps/api/zap.yaml`, so the
Zapper project root is `repo/apps/api`.

Running `zap status` from `repo/apps/api/src` also uses
`repo/apps/api/zap.yaml`, because it is found before `repo/zap.yaml` while
walking upward.

Running `zap status` from `repo` uses `repo/zap.yaml`, so the Zapper project
root is `repo`.

These are distinct Zapper projects even if they live in the same Git repository.

## Custom Config Paths

When `--config <file>` is passed, Zapper uses that file directly. It does not
fall back to a parent `zap.yaml` if the custom file is missing.

The project root is still the directory containing the selected config file:

```bash
zap --config ./prod.yaml status
```

uses `./prod.yaml`, so the project root is the current directory if `prod.yaml`
is there.

```bash
zap --config ./apps/api/local.yaml status
```

uses `./apps/api/local.yaml`, so the project root is `./apps/api`.

If `--config <directory>` is passed, Zapper searches upward from that directory
for `zap.yaml` or `zap.yml`. It does not search downward inside the directory.

## System Registry Identity

The system registry should identify a Zapper project by the resolved config
path, not only by the `project` field inside `zap.yaml`.

The current registry ID is derived from:

```text
realProjectRoot + "\0" + realConfigPath
```

This is intentional:

- Multiple directories in one Git repo may each have their own `zap.yaml`.
- Multiple configs can use the same `project` name.
- Multiple configs can live in the same directory.
- A checkout can move on disk.

The `project` field in `zap.yaml` remains the runtime resource namespace used in
PM2/Docker names. It is not globally unique and should not be treated as the
system registry identity by itself.

## Practical Rule

If a directory contains a `zap.yaml` or `zap.yml`, it can be a Zapper project
root when Zapper resolves that file. Nested Zapper projects are allowed and
should be treated as separate projects by system-level tooling.
