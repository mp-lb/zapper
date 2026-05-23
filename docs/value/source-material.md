---
question: "What evidence and user-provided context is available?"
inputs:
  - ../../AGENTS.md
  - ../../apps/landing-page/app/page.tsx
  - ../../apps/landing-page/app/layout.tsx
  - ../index.md
  - ../commands.md
  - ../configuration.md
  - ../services.md
  - ../tasks.md
  - ../profiles.md
  - ../instances.md
  - ../project-metadata.md
  - ../cli-development.md
  - ../env-var-mgmt.md
  - ../global-registry.md
  - ../local-runtime.md
  - ../output.md
  - ../x-posts.md
  - ../compose-study.md
  - ../taskfile-study.md
  - ../../packages/cli/src/config/schemas.ts
  - ../../packages/cli/src/cli/CommanderCli.ts
  - ../../packages/cli/package.json
  - ../../apps/macos/README.md
---

## Evidence

- User request: build a value-analysis library in `docs/value`.
- Repo summary in `AGENTS.md`: Zapper is a lightweight dev environment runner that defines local dev setup in one `zap.yaml` and delegates to PM2 for processes and Docker for containers.
- The landing page in `apps/landing-page/app/page.tsx` frames Zapper as "The process manager for agents" and repeats three core properties: stateful, detached, and isolated per worktree.
- The landing page also makes the main user promise explicit: one agent can start a stack, another can inspect it later, without long-lived terminals, PID handoff, or port clashes.
- Product docs in `docs/index.md`, `docs/commands.md`, `docs/configuration.md`, `docs/services.md`, and `docs/tasks.md` describe the current CLI model, config surface, and workflow.
- `packages/cli/src/config/schemas.ts` shows supported config fields including mixed native and Docker services, profiles, ports, volumes, secrets, tasks, interpolation, and watch rules.
- `packages/cli/src/cli/CommanderCli.ts` confirms `zap ps` is a real alias on the CLI surface, which aligns the landing page copy with shipped command naming.
- `docs/profiles.md` and `docs/instances.md` describe profile-based service/env selection, isolated stacks, instance-scoped ports, labels, and generated volumes.
- `docs/env-var-mgmt.md` clarifies the stricter environment-routing story behind landing-page copy such as "whitelisted per service."
- `docs/project-metadata.md`, `docs/output.md`, and `docs/global-registry.md` describe project links/homepages/notes, structured command output, and a machine-wide registry/system view.
- `docs/local-runtime.md` and `apps/macos/README.md` describe a native macOS menu bar app that uses a bundled Zapper CLI runtime and stack-oriented controls.
- `docs/cli-development.md` reinforces that the macOS app shells out to the CLI and does not parse `zap.yaml` or `.zap` state directly.
- `docs/x-posts.md` captures the repo’s informal product language: less shell history archaeology, less local folklore, and one file that humans, desktop tooling, and agents can all read.
- `docs/compose-study.md` and `docs/taskfile-study.md` explicitly compare Zapper against Docker Compose and Task, which helps identify likely alternatives and category boundaries.
- `packages/cli/package.json` shows the published CLI package name `@mp-lb/zapper` and confirms PM2 is a runtime dependency.

## Inferences

- The repo documents both shipped behavior and design-direction documents. Claims grounded in `global-registry.md`, `local-runtime.md`, `compose-study.md`, `taskfile-study.md`, and promotional copy should be treated more cautiously than schema-backed or quick-start-backed behavior.
- The product is aimed at local development workflow control rather than production deployment.
- The available evidence is now strong on feature surface, workflow intent, and the product’s preferred messaging angle, but still weak on pricing, adoption, and buyer-role specifics.
