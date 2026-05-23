---
question: "What would customers use or do instead?"
inputs:
  - source-material.md
  - product-features.md
---

## Evidence

- Docker Compose for container-only stack definition and lifecycle control. The repo has an explicit `compose-study.md`, which implies Compose is a meaningful comparison point.
- Task or Taskfile for one-off commands and repeatable local scripts. The repo has an explicit `taskfile-study.md`, which makes it a relevant adjacent alternative.
- PM2 plus repo-specific shell scripts for native process supervision, because Zapper itself delegates native services to PM2.
- Manual local-dev workflows:
  - multiple terminal tabs
  - ad hoc `docker run` or `docker compose` commands
  - npm or pnpm scripts
  - Makefiles, shell scripts, or README runbooks
  - manual env-file switching and port editing
- Internal or team-specific bootstrap tooling that glues together processes, containers, tasks, and links for one codebase.
- Human-readable setup docs are an explicit alternative. The repo’s own messaging says many setup docs act like a process manager written in prose.

## Inferences

- Procfile-style or process-runner tools such as Foreman or Overmind are likely alternatives for teams that mainly need native process management.
- Local orchestration tools such as Tilt or DevSpace are possible alternatives when the stack leans heavily toward container workflows, but the repo does not name them directly.
- Doing nothing is a real alternative: some teams will continue to rely on tribal knowledge, shell history, and manual terminal rituals until local-environment complexity becomes painful enough.
