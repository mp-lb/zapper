---
question: "What does the product do?"
inputs:
  - source-material.md
---

## Evidence

- Zapper uses one `zap.yaml` to define a local multi-service project.
- It manages native services through Zapper's native supervisor and Docker services through Docker CLI, while treating both as peer service types.
- It supports service lifecycle control and inspection through commands such as `zap up`, `zap down`, `zap restart`, `zap status`, `zap ls`, `zap logs`, `zap startup-log`, and `zap watch`.
- It also exposes `zap ps` as a CLI alias for stack status, matching the landing-page messaging.
- It supports root env stacks, service-specific env routing, config interpolation, and assigned port variables.
- It supports profiles that combine env file selection, service selection, and optional stack isolation.
- It supports instance-scoped state including labels, random runtime IDs, assigned ports, and generated Docker volumes.
- It includes one-off tasks with params, preconditions, status checks, nested tasks, silent mode, and interactive mode.
- It includes repo and project utilities such as `zap clone`, `zap init`, project homepage/links/notes, and link-opening commands.
- It exposes machine-readable JSON and JSONL command output for automation and tooling.
- It has a native macOS menu bar app that uses the CLI/system view rather than reading project files directly.
- The product pitch emphasizes that stack truth lives on disk rather than in one foreground terminal session, so a later human or agent can query the same stack state.

## Inferences

- Zapper is not just a process starter. It is trying to centralize how a local stack is described, started, switched, inspected, opened, and handed off between actors.
- The product emphasis is operational consistency for development environments, especially when the stack mixes app processes, containers, one-off tasks, local metadata, and agent or multi-actor handoff.
