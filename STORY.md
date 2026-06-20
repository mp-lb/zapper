# Zapper Story

Local development has outgrown the terminal tab.

Modern apps are not one process anymore. They are API servers, workers,
frontends, databases, caches, queues, webhooks, tunnels, seed scripts, and
end-to-end test stacks. Some run natively because that is fastest. Some run in
Docker because that is repeatable. Most real projects need both.

Without a central runner, this becomes ambient chaos. Every repo grows its own
mix of shell history, `package.json` scripts, Docker Compose files, Makefiles,
`.env` files, README instructions, and tribal knowledge. Developers lose track
of what is running, which ports are in use, where logs went, and how to restart
the right thing without disturbing everything else.

That pain compounds once a team has more than one active project. It compounds
again with git worktrees. It compounds even faster with AI agents, because
agents need a reliable way to answer simple operational questions:

- How do I start this project?
- What services are running?
- What ports were assigned?
- Where are the logs?
- Can I run another instance without breaking the first one?

Zapper gives every project one answer: `zap.yaml`.

It is infrastructure as code for local development. Define native processes,
Docker containers, environment files, ports, links, and tasks in one small
project file. Then `zap up` boots the stack, `zap ps` shows the truth, `zap logs`
explains what happened, and `zap down` cleans it up.

Docker Compose solved a huge part of this problem for containers. Zapper extends
the same idea to the way local development actually works: native processes and
containers as peers. A frontend can run with `pnpm dev`, a worker can run
through Zapper's native supervisor, Postgres can run in Docker, and the whole thing still behaves like
one stack.

The wedge is worktree-safe local infrastructure.

Every Zapper stack instance gets its own state, ports, and generated resources.
That means a developer can run the same project twice. An agent can spin up a
copy in its own worktree. A test runner can launch an isolated end-to-end stack.
No port roulette. No shared terminal session. No guessing which process belongs
to which checkout.

This is especially important for AI-assisted development. Agents are not one
person sitting in one foreground terminal. They start, inspect, hand off, and
exit. Zapper's detached, stateful model fits that workflow: one agent can start
the stack, another can check status later, and a human can see the same system
from the CLI or the desktop app.

The desktop app matters because local infrastructure should be visible. When
multiple projects are running, Zapper gives the developer a system-wide view:
what is up, what can be stopped, and where to jump next. Local services stop
being invisible background state and become manageable infrastructure.

Zapper is for teams and developers who have crossed the line from "run the app"
to "run the local system." If you have one small project, the pain may not be
obvious yet. If you have several projects, multiple services, worktrees, agents,
or parallel test environments, the old model breaks down quickly.

The promise is simple:

One file for the local stack. One command to start it. One place to see what is
running. Native and Docker together. Isolated instances when you need them.
Built for humans, and shaped for agents.

## Positioning

This system is a local runtime orchestrator for modern development. It manages native processes, containers, service wiring, and automatic port allocation from a single declarative project definition, making it possible to run many isolated instances of the same stack simultaneously without conflicts.

Unlike Docker Compose or traditional process managers, the focus is not just starting services — it is managing local application topology. Native processes and containers can interoperate seamlessly, with dynamic ports and automatic dependency wiring handled by the runtime itself.

The system complements tools like Nix, mise, and Docker rather than replacing them. Those tools solve dependency installation and reproducibility; this system solves orchestration, isolation, and multi-instance local development, which becomes increasingly important in AI-native workflows.
