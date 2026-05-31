# Project Metadata

Project metadata gives people and tools quick access to useful project URLs and
notes without encoding them in scripts.

## Homepage

Set a top-level homepage as the default target for `zap launch`:

```yaml
homepage: http://localhost:3000
```

```bash
zap launch
zap home
```

## Links

Links are named URLs for docs, dashboards, staging environments, and other
project resources.

```yaml
links:
  - name: API Docs
    url: http://localhost:${API_PORT}/docs
  - name: Staging
    url: https://staging.example.com
  - name: Figma
    url: https://figma.com/file/abc123
```

```bash
zap open
zap launch "API Docs"
zap links
zap open "API Docs"
zap o "API Docs"
zap open --home
```

`zap open` opens an interactive picker for the homepage and configured links.
Pass a link name, use `zap open --home`, or use `zap launch` when you want to
open a URL without prompting.

Link URLs support `${VAR}` interpolation from root env files and assigned
ports.

| Property | Required | Description                           |
| -------- | -------- | ------------------------------------- |
| `name`   | Yes      | Display name, up to 100 characters    |
| `url`    | Yes      | URL, with `${VAR}` interpolation      |

## Notes

Notes are top-level project text that can include interpolated env values.

```yaml
env: [.env]
notes: |
  Frontend: http://localhost:${FRONTEND_PORT}
  API: http://localhost:${API_PORT}
```

```bash
zap notes
zap notes --json
```
