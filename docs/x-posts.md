# Low-Key X Posts

Default attachment strategy: use the landing page link card for most posts:
`https://zapper.mp-lb.dev`

Use images sparingly. The best image candidates are plain screenshots of the
landing page, a real terminal session, or the macOS menu bar app. Avoid
polished promo graphics unless the post is explicitly announcing a release.

1. Local dev stacks keep getting less local.

   API, frontend, worker, database, cache, tunnel, seed script.

   Zapper is a small attempt to put the whole thing back behind one file:

   `zap.yaml`

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

2. I want local dev to feel more like:

   `zap up`
   `zap status`
   `zap logs api`
   `zap down`

   Less shell history archaeology. Less "which terminal tab was that in?"

   https://zapper.mp-lb.dev

   Attachment: landing page link card. Optional image only if it is a real
   terminal screenshot showing these commands.

3. Docker Compose is great when everything is a container.

   Most projects I work on are not like that.

   Zapper treats native processes and Docker containers as parts of the same local stack.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

4. The basic idea behind Zapper:

   define your local system once, then stop memorizing how to boot it.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

5. Local development has a visibility problem.

   Things are running somewhere. Ports are taken. Logs exist, maybe. A database is probably alive.

   `zap status` is meant to make that less mysterious.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. Optional image: cropped terminal output
   from `zap status` if it looks clean and real.

6. A `zap.yaml` can define native services, Docker services, env files, ports, links, and tasks.

   The goal is not to be clever.

   The goal is to make "how do I run this project?" boring.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

7. One thing I care about with Zapper:

   you should be able to run the same project twice from two worktrees without port roulette.

   Local stacks should have real instance boundaries.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

8. AI agents make local dev assumptions painfully obvious.

   They need to know:

   what starts the app, what is running, which ports were assigned, and where logs went.

   Zapper gives them a concrete place to look.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

9. Zapper is not trying to replace Docker.

   It is trying to sit next to Docker and cover the messy native-process half of local development too.

   https://zapper.mp-lb.dev

   Attachment: landing page link card. No image.

10. A lot of dev setup docs are just a human-readable process manager.

    Zapper moves that into `zap.yaml` so the CLI, desktop app, humans, and agents can all read the same thing.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. Optional image: landing page screenshot
    if the link preview is not rendering well on X.

11. The local dev loop I want:

    `zap up`

    work

    `zap logs worker`

    fix something

    `zap restart worker`

    keep going

    https://zapper.mp-lb.dev

    Attachment: landing page link card. Optional image only if it is a real
    terminal screenshot from this loop.

12. Small projects can get away with a README command.

    Multi-service projects usually grow into a pile of scripts, tabs, ports, env files, and half-remembered cleanup steps.

    That is the gap Zapper is for.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

13. Zapper's pitch is deliberately simple:

    one file for the local stack.

    one command to start it.

    one place to see what is running.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

14. I keep coming back to this: processes are processes.

    If your frontend runs with `pnpm dev` and Postgres runs in Docker, your local runner should understand both.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

15. The annoying part of local infra is not always starting it.

    It is knowing what is already running, which checkout owns it, and how to stop the right thing.

    Zapper is built around that problem.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. Optional image: macOS menu bar app
    screenshot if it clearly shows multiple running projects.

16. Worktrees are a forcing function for better local dev tooling.

    If a tool assumes one checkout, one set of ports, and one foreground terminal, it starts to fall apart fast.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

17. Zapper is WIP, but the shape is clear:

    Zapper's native supervisor for native processes.
    Docker for containers.
    `zap.yaml` as the project contract.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

18. I like dev tools that reduce local folklore.

    "Ask someone on the team which commands to run" should become "read the project file."

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.

19. A local stack should be easy to hand off.

    One agent starts it.
    Another checks status later.
    A human opens the desktop app and sees the same state.

    That is the direction for Zapper.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. Optional image: desktop app screenshot,
    but only if it feels like a product-in-use screenshot rather than an ad.

20. Zapper is for the moment when "run the app" has quietly become "run the local system."

    Native services, Docker services, tasks, ports, logs, and cleanup in one place.

    https://zapper.mp-lb.dev

    Attachment: landing page link card. No image.
