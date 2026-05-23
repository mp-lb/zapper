import { DocsCTAButton } from "@/components/landing/DocsCTAButton";
import { DownloadMacButton } from "@/components/landing/DownloadMacButton";
import { InstallSnippet } from "@/components/landing/InstallSnippet";
import { Out, Prompt, Terminal } from "@/components/landing/Terminal";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  Boxes,
  Cable,
  Layers3,
  Logs,
  MonitorCog,
  Orbit,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const navLinks = [
  {
    label: "Docs",
    href: "https://docs.zapper.mp-lb.dev",
  },
  {
    label: "Agent docs",
    href: "https://docs.zapper.mp-lb.dev/llms-full.txt",
  },
  { label: "Mac app", href: "#macos" },
  { label: "GitHub", href: "https://github.com/felixsebastian/zapper" },
  { label: "Discord", href: "https://discord.gg/2zdyJMce" },
];

const heroPills = [
  "State lives on disk",
  "Detached from the terminal",
  "One stack per worktree",
  "Native + Docker in one runtime",
];

const heroStats = [
  {
    value: "03",
    label: "parallel worktrees",
    note: "Same repo, separate ports and state.",
  },
  {
    value: "00",
    label: "port collisions",
    note: "Random assignments keep stacks out of each other's way.",
  },
  {
    value: "01",
    label: "shared control plane",
    note: "CLI, agents, and Mac app all talk to the same runtime.",
  },
];

const pillars = [
  {
    eyebrow: "01 / STATEFUL",
    title: "Ask from any shell.",
    body: "The truth lives on disk, so zap ps and zap ls report what is actually running, not what one terminal happens to remember.",
  },
  {
    eyebrow: "02 / DETACHED",
    title: "The stack survives handoffs.",
    body: "Processes keep running after the shell or agent that started them exits. Another operator can check logs, restart services, or open the app later.",
  },
  {
    eyebrow: "03 / ISOLATED",
    title: "Each worktree gets its own world.",
    body: "Ports, volumes, and runtime state stay scoped to the checkout that launched them, so parallel branches stop fighting over localhost.",
  },
];

const capabilities = [
  {
    icon: Layers3,
    title: "One command, whole stack",
    body: "zap up boots native processes and Docker containers together, in dependency order. zap down tears them back down cleanly.",
  },
  {
    icon: Orbit,
    title: "Automatic port management",
    body: "Every stack instance gets fresh port assignments, so multiple worktrees of the same project can run side by side without env juggling.",
  },
  {
    icon: Cable,
    title: "Native + Docker, same config",
    body: "Declare PM2-backed processes and Docker services in one zap.yaml. Mix and match without maintaining two systems.",
  },
  {
    icon: ShieldCheck,
    title: "Whitelisted environment flow",
    body: "Each service only sees the variables it explicitly asks for. Secrets stay out of the processes that do not need them.",
  },
  {
    icon: Logs,
    title: "Logs that survive crashes",
    body: "Because PM2 is underneath, logs keep flowing after the editor or terminal dies. zap logs api is still there when you come back.",
  },
  {
    icon: Boxes,
    title: "Tasks, profiles, and instances",
    body: "Seed data, swap environments, or spin up named instances for demos and tests without bolting extra scripts onto package.json.",
  },
];

const commandCards = [
  ["zap up", "Start everything, or a subset with dependencies."],
  ["zap down", "Stop the stack cleanly."],
  ["zap ls", "Show status plus assigned ports and links."],
  ["zap logs api", "Tail logs for one service on demand."],
  ["zap restart api worker", "Bounce only the pieces you changed."],
  ["zap task seed", "Run a declared task inside the project context."],
];

const handoffFlow = [
  ["agent-a", "zap up"],
  ["agent-b", "zap logs api"],
  ["you", "zap open"],
];

const runtimeHighlights = [
  "PM2-backed native processes",
  "Docker CLI integration",
  "Per-worktree state and volumes",
  "Random port allocation with named links",
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-12rem] top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(255,132,74,0.26),_transparent_68%)]" />
        <div className="absolute right-[-8rem] top-[6rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,_rgba(70,180,158,0.18),_transparent_66%)]" />
        <div className="absolute bottom-[-14rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_rgba(27,40,67,0.08),_transparent_72%)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono-tight text-sm font-semibold tracking-[0.18em] text-foreground"
          >
            <span className="text-accent">▲</span>
            <span>ZAP</span>
            <span className="text-muted-foreground">/ ZAPPER</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("#") ? undefined : "_blank"}
                rel={link.href.startsWith("#") ? undefined : "noreferrer"}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <a
            href="https://github.com/felixsebastian/zapper"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-foreground/10 bg-card/70 px-4 py-2 font-mono-tight text-xs tracking-[0.14em] text-foreground shadow-sm backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 md:inline-flex"
          >
            VIEW SOURCE
          </a>
        </div>
      </header>

      <main className="relative">
        <section className="container pb-20 pt-14 md:pt-20 lg:pb-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)] lg:items-center">
            <div className="max-w-2xl">
              <div className="reveal delay-1 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/70 px-4 py-2 font-mono-tight text-[11px] tracking-[0.24em] text-muted-foreground shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-accent" />
                BUILT FOR PARALLEL LOCAL DEV
              </div>

              <h1 className="font-display reveal delay-2 mt-6 max-w-4xl text-[clamp(3.6rem,8vw,7rem)] leading-[0.92]">
                Local stacks
                <span className="block text-accent">
                  that survive handoffs.
                </span>
              </h1>

              <p className="reveal delay-3 mt-6 max-w-xl text-lg leading-8 text-muted-foreground md:text-xl">
                Zapper keeps native processes and Docker containers inside one
                declarative runtime, isolated per worktree. Start from one
                shell, inspect from another, and let agents come and go without
                losing the stack.
              </p>

              <div className="reveal delay-4 mt-8 flex flex-wrap items-center gap-3">
                <InstallSnippet
                  command="npm i -g pm2 @mp-lb/zapper"
                  className="h-11 rounded-full border-0 bg-[hsl(var(--panel))] px-5 shadow-[0_18px_48px_rgba(21,24,34,0.16)]"
                />
                <DocsCTAButton
                  href="https://docs.zapper.mp-lb.dev"
                  label="Read the docs"
                  className="h-11 px-5"
                />
              </div>

              <div className="reveal delay-5 mt-8 flex flex-wrap gap-3">
                {heroPills.map((pill) => (
                  <div
                    key={pill}
                    className="rounded-full border border-foreground/10 bg-white/65 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur"
                  >
                    {pill}
                  </div>
                ))}
              </div>

              <div className="reveal delay-6 mt-10 rounded-[1.75rem] border border-border/70 bg-white/65 p-5 shadow-[0_18px_60px_rgba(18,24,39,0.08)] backdrop-blur">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-lg">
                    <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                      CORE PHILOSOPHY
                    </p>
                    <p className="mt-3 text-lg text-foreground">
                      Processes are processes. Zapper just gives them a shared
                      control plane.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:min-w-72">
                    {handoffFlow.map(([actor, command]) => (
                      <div
                        key={actor}
                        className="flex items-center justify-between rounded-2xl border border-foreground/8 bg-[hsl(var(--panel))] px-4 py-3 font-mono-tight text-sm text-white"
                      >
                        <span className="text-white/65">{actor}</span>
                        <span className="text-[hsl(var(--term-prompt))]">
                          {command}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="reveal delay-4 relative lg:pl-6">
              <div className="absolute inset-x-6 top-6 -z-10 h-full rounded-[2.5rem] bg-[linear-gradient(135deg,rgba(255,123,73,0.18),rgba(255,255,255,0),rgba(74,184,160,0.14))] blur-3xl" />

              <div className="rounded-[2.25rem] border border-border/70 bg-white/72 p-4 shadow-[0_28px_120px_rgba(18,24,39,0.12)] backdrop-blur">
                <div className="mb-4 flex items-center justify-between gap-4 px-2">
                  <div>
                    <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                      LIVE RUNTIME
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      One agent starts it. Another one can pick up from there.
                    </p>
                  </div>
                  <div className="rounded-full border border-foreground/10 bg-card px-3 py-1 font-mono-tight text-[11px] tracking-[0.18em] text-muted-foreground">
                    HANDOFF READY
                  </div>
                </div>

                <Terminal
                  title="todo-app · runtime"
                  className="rounded-[1.6rem] shadow-none"
                >
                  <Prompt>zap up</Prompt>
                  <Out color="accent">Starting postgres, redis</Out>
                  <Out color="accent">Starting api, worker</Out>
                  <Out color="accent">Starting web</Out>
                  {"\n"}
                  <Prompt>zap ls</Prompt>
                  <Out color="muted">== Services (todo-app · 0x1a42) ==</Out>
                  {"\n"}
                  <Out color="muted">{"TYPE    SERVICE   STATUS  LINK"}</Out>
                  <Out>
                    {"native  api       "}
                    <span className="text-[hsl(var(--term-up))]">UP</span>
                    {"      :50230"}
                  </Out>
                  <Out>
                    {"native  web       "}
                    <span className="text-[hsl(var(--term-up))]">UP</span>
                    {"      :61964"}
                  </Out>
                  <Out>
                    {"native  worker    "}
                    <span className="text-[hsl(var(--term-up))]">UP</span>
                    {"      queue"}
                  </Out>
                  <Out>
                    {"docker  postgres  "}
                    <span className="text-[hsl(var(--term-up))]">UP</span>
                    {"      :54588"}
                  </Out>
                  <Out>
                    {"docker  redis     "}
                    <span className="text-[hsl(var(--term-up))]">UP</span>
                    {"      :54589"}
                  </Out>
                  {"\n"}
                  <Prompt>zap open</Prompt>
                  <Out color="muted">→ opening http://localhost:61964</Out>
                </Terminal>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {heroStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-[1.5rem] border border-foreground/8 bg-card/85 p-4 shadow-sm"
                    >
                      <div className="font-display text-4xl leading-none text-foreground">
                        {stat.value}
                      </div>
                      <div className="mt-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-accent">
                        {stat.label}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {stat.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-16 lg:py-20">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                WHY IT FITS AGENTS
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight md:text-5xl">
                Stateful. Detached. Isolated.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
              Most process managers assume one human, one terminal, in the
              foreground. Zapper is happier when the operator changes.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-white/70 p-6 shadow-[0_18px_60px_rgba(18,24,39,0.08)] backdrop-blur"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(255,120,70,0.9),rgba(74,184,160,0.65))]" />
                <p className="font-mono-tight text-xs uppercase tracking-[0.28em] text-accent">
                  {pillar.eyebrow}
                </p>
                <h3 className="mt-6 text-2xl font-semibold leading-tight text-foreground">
                  {pillar.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="container py-16 lg:py-20" id="system">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div className="rounded-[2.25rem] border border-white/10 bg-[hsl(var(--panel))] p-8 text-white shadow-[0_26px_100px_rgba(18,24,39,0.18)]">
              <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-[hsl(var(--term-prompt))]">
                ONE CONTROL PLANE
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight md:text-5xl">
                Run the whole stack from one zap.yaml.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/72">
                Native services, Docker containers, tasks, profiles, env file
                sets, and named instances all live in the same runtime model.
                The CLI stays small because the config carries the context.
              </p>

              <div className="mt-8 grid gap-3">
                {runtimeHighlights.map((highlight) => (
                  <div
                    key={highlight}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                  >
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--term-prompt))]" />
                    {highlight}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {capabilities.map((capability) => {
                const Icon = capability.icon;

                return (
                  <div
                    key={capability.title}
                    className="rounded-[2rem] border border-border/70 bg-white/72 p-6 shadow-[0_18px_60px_rgba(18,24,39,0.08)] backdrop-blur"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(255,122,71,0.16),rgba(74,184,160,0.14))] text-accent">
                      <Icon aria-hidden="true" size={22} />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold leading-tight text-foreground">
                      {capability.title}
                    </h3>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                      {capability.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="container py-16 lg:py-20">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="rounded-[2.25rem] border border-border/70 bg-white/72 p-6 shadow-[0_18px_60px_rgba(18,24,39,0.08)] backdrop-blur md:p-8">
              <div className="mb-6 max-w-2xl">
                <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                  WORKTREE ISOLATION
                </p>
                <h2 className="font-display mt-4 text-4xl leading-tight md:text-5xl">
                  One repo. Three branches. Zero port collisions.
                </h2>
                <p className="mt-4 text-lg leading-8 text-muted-foreground">
                  Checkout isolation already exists on disk. Zapper extends it
                  into ports, volumes, and service state so parallel branches
                  stop fighting over localhost.
                </p>
              </div>

              <div className="overflow-x-auto rounded-[1.6rem] border border-white/10 bg-[hsl(var(--panel))] p-5 font-mono-tight text-[13px] leading-7 text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <pre>
                  <code>{`project: todo-app
homepage: http://localhost:\${FRONTEND_PORT}
ports:
  - API_PORT
  - FRONTEND_PORT
  - POSTGRES_PORT
  - REDIS_PORT

native:
  api:
    cmd: pnpm dev
    cwd: ./apps/api
    depends_on: [postgres, redis]
  web:
    cmd: pnpm dev
    cwd: ./apps/web

docker:
  postgres:
    image: postgres:16
    ports: [\${POSTGRES_PORT}:5432]
  redis:
    image: redis:7-alpine
    ports: [\${REDIS_PORT}:6379]`}</code>
                </pre>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.58))] p-6 shadow-[0_18px_60px_rgba(18,24,39,0.08)] backdrop-blur md:p-8">
                <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                  COMMAND SURFACE
                </p>
                <h3 className="font-display mt-4 text-3xl leading-tight md:text-4xl">
                  Short CLI, real coverage.
                </h3>
                <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
                  The day-to-day flow stays compact: bring the stack up, inspect
                  it, open links, tail logs, and run tasks when you need them.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {commandCards.map(([command, description]) => (
                  <div
                    key={command}
                    className="rounded-[1.75rem] border border-border/70 bg-white/72 p-5 shadow-[0_16px_50px_rgba(18,24,39,0.07)] backdrop-blur"
                  >
                    <code className="font-mono-tight text-sm text-accent">
                      {command}
                    </code>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container py-16 lg:py-20" id="macos">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center">
            <div className="relative">
              <div className="absolute left-6 top-8 z-10 rounded-full border border-white/15 bg-[hsl(var(--panel))]/92 px-4 py-2 font-mono-tight text-xs tracking-[0.18em] text-white/80 backdrop-blur">
                MAC MENU BAR
              </div>
              <div className="overflow-hidden rounded-[2.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(18,24,39,0.9),rgba(18,24,39,0.74))] p-5 shadow-[0_28px_120px_rgba(18,24,39,0.18)]">
                <div className="mx-auto max-w-[470px] rounded-[2rem] border border-white/10 bg-white/5 p-3">
                  <Image
                    src="/macos-screenshot.png"
                    alt="Zapper macOS menu bar dashboard showing running local services"
                    width={882}
                    height={1064}
                    className="h-auto w-full rounded-[1.4rem]"
                    sizes="(min-width: 1024px) 470px, min(100vw - 3rem, 470px)"
                    priority
                  />
                </div>
              </div>
            </div>

            <div className="max-w-xl">
              <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-accent">
                DESKTOP VIEW
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight md:text-5xl">
                See the same runtime from the menu bar.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                The macOS app reads the same Zapper state as the CLI, so the
                desktop view and terminal commands stay in sync. Start, stop, or
                open a stack without hunting for the shell that launched it.
              </p>

              <div className="mt-8 grid gap-3">
                {[
                  "Quick start and stop actions for each running project.",
                  "Open links for the current stack directly from the menu bar.",
                  "Useful when the stack is still running but the original shell is gone.",
                ].map((point) => (
                  <div
                    key={point}
                    className="flex items-start gap-3 rounded-2xl border border-border/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur"
                  >
                    <MonitorCog
                      aria-hidden="true"
                      size={18}
                      className="mt-0.5 shrink-0 text-accent"
                    />
                    <span className="text-sm leading-6 text-muted-foreground">
                      {point}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <DownloadMacButton />
                <DocsCTAButton
                  href="https://docs.zapper.mp-lb.dev/llms-full.txt"
                  label="Agent docs"
                  className="h-11 px-5"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="container pb-24 pt-8">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-[hsl(var(--panel))] px-6 py-10 text-white shadow-[0_28px_120px_rgba(18,24,39,0.18)] md:px-10 md:py-12">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,124,72,0.24),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(76,182,160,0.18),transparent_28%)]"
            />

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono-tight text-xs uppercase tracking-[0.3em] text-[hsl(var(--term-prompt))]">
                  FINAL CTA
                </p>
                <h2 className="font-display mt-4 text-4xl leading-tight md:text-5xl">
                  Give your agents a stack they can actually drive.
                </h2>
                <p className="mt-5 text-lg leading-8 text-white/72">
                  One yaml. One CLI. Stateful, detached, isolated. Works just as
                  well when the only agent at the keyboard is you.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <InstallSnippet
                  command="npm i -g pm2 @mp-lb/zapper"
                  className="h-11 rounded-full border border-white/10 bg-black/20 px-5 shadow-none"
                />
                <Button
                  asChild
                  className="h-11 rounded-full bg-white px-5 font-mono-tight text-[hsl(var(--panel))] hover:bg-white/92"
                >
                  <a
                    href="https://github.com/felixsebastian/zapper"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                    <ArrowRight aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="container flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 font-mono-tight text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Bot aria-hidden="true" size={14} className="text-accent" />
            <span>Built by MAP Lab</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("#") ? undefined : "_blank"}
                rel={link.href.startsWith("#") ? undefined : "noreferrer"}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
