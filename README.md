# Zapper

Infrastructure as code for your local development environment.

## Why Zapper?

**One file, entire stack.** Define processes, containers, environment variables, and tasks in a single `zap.yaml`. No more scattered terminal tabs, docker-compose files, Makefiles, and `.env` files across repos.

**Zero mental overhead.** Coming back to a project after months? `zap up` and you're running. No remembering which services to start, what ports they use, or where the logs are.

**Resource-friendly.** Spin up and tear down entire multi-service projects instantly. On a MacBook juggling multiple projects, this matters.

**Detached logs.** Built on PM2, so logs persist even if your terminal or editor crashes. Attach when you need them, detach when you don't. No dedicated terminal windows to babysit. This is much friendlier for AI agents too.

**Editor integration.** The Cursor/VSCode extension lets you start/stop services and view logs without leaving your editor.

**Secure env vars.** Centralize environment variables and whitelist which services see what. Secrets stay out of services that don't need them.

## Documentation

- **[Usage](docs/usage.md)** — Installation, configuration, CLI reference
- **[Development](docs/development.md)** — Contributing, testing, releases
