---
question: "What can this product do that alternatives cannot credibly claim?"
inputs:
  - product-features.md
  - list-of-competitors.md
---

## Evidence

- Zapper describes native PM2-managed processes and Docker-managed services in one config model and treats them as peer services. Container-only tools and process-only tools cannot honestly claim that same cross-runtime model.
- Zapper combines env-file selection, service selection, and stack isolation into profiles, then layers instance-scoped IDs, ports, and volumes on top. Manual scripts and single-purpose tools usually make users coordinate those concerns separately.
- Zapper namespaces PM2 processes, Docker containers, and generated volumes together under the same project/instance model. That gives one runtime identity across mixed local infrastructure.
- Zapper exposes project metadata, structured command output, system inventory, and a macOS menu bar app on top of the same stack model. Point tools usually expose only their own runtime slice.
- The repo’s agent-first pitch is grounded in product behavior: stack state is persisted and detached, so one actor can start a stack and a different actor can inspect or operate on it later without terminal-local memory.

## Inferences

- The most defensible differentiated claim is not "better local dev" or "easier workflows." It is "one stateful local stack model across both native and containerized services, with control surfaces that survive the terminal session that started the work."
- "For agents" is credible only because it rests on concrete properties: stateful, detached, and isolated. Without those, it would read as generic AI framing.
- Features such as tasks, links, and watch rules matter, but they are weaker differentiators because adjacent tools can plausibly claim versions of them.
