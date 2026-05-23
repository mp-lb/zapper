---
question: "What category or frame makes the value obvious?"
inputs:
  - ideal-customer.md
  - list-of-competitors.md
  - unique-capabilities.md
---

## Evidence

- The repo repeatedly describes Zapper as a lightweight dev environment runner for local multi-service projects.
- The strongest product difference is cross-runtime stack control, not container orchestration alone and not task execution alone.
- The product also extends beyond the CLI into machine inventory and a macOS menu bar app.
- The landing page gives the product an explicit wedge: "The process manager for agents."

## Inferences

- Best market frame: an agent-ready cross-runtime local dev environment runner.
- Clearer expansion of that frame: a local stack control plane for mixed native and Docker services that multiple humans or agents can share over time.
- Comparison frame to borrow, not own: "Compose-like reproducibility for local stacks, but not limited to containers."
- Messaging wedge worth testing: "process manager for agents."
- Category frames to avoid:
  - production orchestrator
  - task runner
  - PM2 wrapper
  - Docker Compose replacement without qualification

That frame keeps the product close to an existing developer mental model while preserving the real differentiator: one stateful stack model across multiple local runtimes and control surfaces.
