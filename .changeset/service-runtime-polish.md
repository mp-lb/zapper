---
"@mp-lb/zapper": patch
"@mp-lb/zapper-sdk": patch
---

Allow Cloud Run web services to opt into CPU idling through the bundled Arc module's `cpu_idle` variable.

Tighten local runtime behavior by clearing managed native service logs when a new run starts, preserving stopped-service logs, showing Docker startup logs when a container never reached a running state, and rejecting configs that combine profiles with root-level env/env_files.
