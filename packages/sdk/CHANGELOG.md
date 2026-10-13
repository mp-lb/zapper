# @mp-lb/zapper-sdk

## 0.20.1

### Patch Changes

- 66cfd6c: Use one required stack-scoped runtime identity across Docker containers,
  Docker Compose grouping metadata, native processes, wrapper scripts, and logs.
  Legacy unscoped resources remain discoverable by global cleanup commands.
- 80d4212: Allow Cloud Run web services to opt into CPU idling through the bundled Arc module's `cpu_idle` variable.

  Tighten local runtime behavior by clearing managed native service logs when a new run starts, preserving stopped-service logs, showing Docker startup logs when a container never reached a running state, and rejecting configs that combine profiles with root-level env/env_files.
