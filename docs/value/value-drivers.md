---
question: "Why do the unique capabilities matter?"
inputs:
  - unique-capabilities.md
---

## Evidence

- One config model across native and Docker services removes the need to split local setup across Compose files, PM2 configs, npm scripts, and README instructions.
- Profile and instance handling reduces collisions when one team or one developer needs different env stacks, service subsets, or isolated local copies.
- Shared namespacing across PM2, Docker, ports, and volumes makes cleanup, inspection, and automation less fragile than ad hoc naming conventions.
- System inventory, structured output, and the macOS app make the same local stack readable by humans, scripts, and desktop tooling.
- Detached stack state means the actor who starts local infrastructure does not need to be the same actor who inspects, debugs, or stops it later.

## Inferences

- Primary pain removed: local environment glue code and the context switching that comes from juggling separate tools for separate runtimes.
- Primary risk reduced: broken or conflicting local stacks caused by port clashes, stale state, orphaned resources, or sticky profile/env choices.
- Primary workflow unlocked: developers and agents can switch between project modes and local stack copies without rewriting scripts or mentally reconstructing the stack each time.
- Primary confidence gain: the same stack description and persisted state can drive CLI usage, automation, agent handoff, and desktop visibility instead of diverging per tool.
