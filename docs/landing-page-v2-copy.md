# Landing Page Copy Snapshot

This is a snapshot of the copy from the pre-redesign landing page in
`apps/landing-page/app/page.tsx`, captured on 2026-05-23 before the v2 rewrite.

## Navigation

- `Docs`
- `Agent docs`
- `Mac app`
- `GitHub`
- `Discord`

## Hero

- Product label: `zapper`
- Headline: `The process manager for agents.`
- Body: `Declarative, stateful, isolated per worktree. One agent spins the stack up, another checks status. No PIDs, no long-lived terminals, no port clashes. Native processes and Docker containers, one yaml, one CLI.`
- Primary CTA command: `npm i -g pm2 @mp-lb/zapper`
- Secondary CTA: `Read the docs →`

## Terminal Demo

Terminal title: `todo-app - zsh`

```text
$ zap up
Starting mongodb, redis
Starting backend, worker
Starting frontend

$ zap ls
== Services (todo-app · 0xbabc) ==

TYPE    SERVICE   STATUS  CMD
native  backend   UP      pnpm dev
native  worker    UP      pnpm worker
native  frontend  UP      pnpm dev
docker  mongodb   UP      mongo:latest
docker  redis     UP      redis:7-alpine

$ zap links
NAME          URL
Frontend      http://localhost:61964
API           http://localhost:50230
Worker queue  http://localhost:50231/queues
Maildev       http://localhost:63050

$ zap open
→ opening http://localhost:61964
```

## Built For Agents

- Section label: `BUILT FOR AGENTS`
- Heading: `Why "for agents"?`
- Body: `Most process managers assume one human, one terminal, in the foreground. Agents work differently: they spawn, query, and exit. Zapper's architecture happens to fit that exactly. The same properties make life easier for humans coordinating with agents or with each other.`

### Cards

1. `01 · STATEFUL`
   - Title: `The truth lives on disk`
   - Body: `zap ps and zap ls return the real state of the stack, not whatever your last terminal session remembered. Any agent, any shell, any time.`
2. `02 · DETACHED`
   - Title: `No long-lived terminals`
   - Body: `PM2-backed processes keep running after the agent that started them exits. Another agent can zap logs api later. No PIDs to pass around, no babysitting.`
3. `03 · ISOLATED`
   - Title: `One stack per worktree`
   - Body: `Run N agents on N worktrees of the same repo. Each gets its own ports, volumes, and state. Parallel work without coordination overhead.`

- CTA: `Read the agent docs →`

## Mac Menu Bar

- Section label: `MAC MENU BAR`
- Heading: `Keep every local stack within reach.`
- Body: `The macOS app shows running projects from the menu bar, with quick start, stop, and open actions for each stack. It uses the same Zapper state as the CLI, so the desktop view and terminal commands stay in sync.`
- CTA: `Download for Mac`

## Process Manager Section

- Heading: `Also a really good process manager`
- Body: `The agent story is the why. The day-to-day is just: a small CLI built on PM2 and the Docker CLI, plus a single yaml that replaces the half-dozen scripts you usually keep in package.json and your shell history.`

### Features

- `One command, whole stack`
  - `zap up boots native processes and Docker containers together, in dependency order. zap down stops everything cleanly.`
- `Automatic port management`
  - `Every stack instance gets unique random ports. Run the same project from three git worktrees, no clashes, no env juggling.`
- `Native + Docker, same config`
  - `Declare PM2-managed processes and Docker services in one zap.yaml. Mix and match without writing two systems.`
- `Status at a glance`
  - `zap ps shows what's up, what's down, and what ports are bound the moment you cd into a project.`
- `Tasks, profiles, environments`
  - `Define tasks like seed or build, switch between profiles, swap env file sets, all from the CLI.`
- `Instances`
  - `Spin up named instances of the same stack side by side for testing, demos, or e2e runs.`
- `Logs that survive crashes`
  - `PM2-backed under the hood, so logs keep flowing even if your terminal or editor dies. zap logs api when you need them.`
- `Env vars, whitelisted per service`
  - `Each service only sees the env vars it declares. Secrets stay out of processes that don't need them.`

## Isolation Section

- Section label: `HOW THE ISOLATION WORKS`
- Heading: `Run the same project three times. No clashes.`
- Body: `Two checkouts of the same repo on disk? They're already isolated. Each one gets its own ports, volumes, and state in .zap/state.json. Spin up four parallel agents on four branches; nobody fights over :3000. Nothing to configure.`

Terminal title: `zap.yaml`

```yaml
project: todo-app
homepage: http://localhost:${FRONTEND_PORT}
env:
  default: [.env.base, .env]
ports:
  - BACKEND_PORT
  - FRONTEND_PORT
  - MONGODB_PORT
  - REDIS_PORT

native:
  backend:
    cmd: pnpm dev
    cwd: ./api
    depends_on: [mongodb, redis]
    healthcheck: http://localhost:${BACKEND_PORT}/health

docker:
  mongodb:
    image: mongo:7
    ports: [${MONGODB_PORT}:27017]
  redis:
    image: redis:7-alpine
    ports: [${REDIS_PORT}:6379]
```

## Commands Section

- Heading: `The commands you'll actually use`
- Body: `The full CLI is bigger than this, but most days it's just these.`

### Commands

- `zap up` — `Start everything (or a subset, with deps)`
- `zap down` — `Stop everything`
- `zap ps` — `Status of every service`
- `zap ls` — `Status + assigned ports`
- `zap logs api` — `Tail logs for a service`
- `zap restart api worker` — `Restart specific services`
- `zap task seed` — `Run a defined task`
- `zap kill` — `Nuke everything for this project`

## Final CTA

- Heading: `Give your agents a stack they can drive.`
- Body: `One yaml. One CLI. Stateful, detached, isolated. Works just as well when the only agent at the keyboard is you.`
- Install command: `npm install -g pm2 @mp-lb/zapper`

## Footer

- `built by MAP Lab`
- Links: `Docs`, `Agent docs`, `Mac app`, `GitHub`, `Discord`
