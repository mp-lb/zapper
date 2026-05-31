---
"@mp-lb/zapper": minor
---

Accept kebab-case config keys in `zap.yaml`. Multi-word keys (`env-files`,
`init-task`, `git-method`, `task-delimiters`, `depends-on`, `internal-dir`,
`read-only`) may now be written in kebab-case as well as snake_case; both are
normalized to the canonical form before validation. User-chosen names
(processes, containers, tasks, volumes, secrets, profiles) are never rewritten.
