---
question: "Who cares most about those value drivers?"
inputs:
  - value-drivers.md
  - list-of-competitors.md
---

## Evidence

- The product is built for local multi-service projects rather than single-process apps.
- The docs emphasize mixed native and Docker stacks, profiles, isolated instances, tasks, links, and machine-wide discovery.
- The landing page explicitly pitches the product to agents, while the docs and macOS app show the same stack model being used by humans, scripts, and desktop tooling.
- The repo repeatedly emphasizes handoff scenarios: one actor starts the stack, another checks status later.

## Inferences

- Best-fit user: engineers or agent-assisted developers working on local application stacks that mix app processes with supporting containers.
- Best-fit team situation: teams that regularly switch between modes such as default, E2E, or alternate data setups, or that run multiple local copies of the same project.
- Likely buyer or internal champion: a senior engineer, tech lead, or developer-experience owner who is tired of maintaining setup glue and onboarding instructions.
- High-friction environment:
  - full-stack apps with several services
  - repos with both containerized dependencies and native dev servers
  - teams that want the same stack visible in terminal workflows, scripts, agents, and a desktop control surface
- Especially strong fit:
  - teams experimenting with coding agents that need to start, inspect, and reuse local stacks without inheriting a specific terminal session
- Lower-fit customer:
  - simple single-service repos
  - container-only teams already happy with Compose
  - teams seeking production orchestration rather than local-dev control
