import { BoltDitherBackground } from "@/components/landing/BoltDitherBackground";

const navLinks = [
  { label: "Docs", href: "https://docs.zapper.mp-lb.dev" },
  {
    label: "Agent instructions",
    href: "https://docs.zapper.mp-lb.dev/llms-full.txt",
  },
  { label: "GitHub", href: "https://github.com/felixsebastian/zapper" },
  { label: "Discord", href: "https://discord.gg/2zdyJMce" },
];

const runtimeRows = [
  ["State", "Stateful on disk"],
  ["Mode", "Detached from the terminal"],
  ["Scope", "Isolated per worktree"],
  ["Stack", "Native + Docker together"],
];

const cards = [
  {
    index: "01",
    title: "The truth lives on disk",
    body: "zap ps and zap ls return the real state of the stack, not whatever your last terminal session remembered.",
  },
  {
    index: "02",
    title: "No long-lived terminals",
    body: "Processes keep running after the agent that started them exits. Another operator can inspect or restart later.",
  },
  {
    index: "03",
    title: "One stack per worktree",
    body: "Run the same project on parallel branches without fighting over localhost, volumes, or shared process state.",
  },
  {
    index: "04",
    title: "One yaml, one CLI",
    body: "Native processes and Docker containers sit behind one config surface, so the control plane stays small.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <BoltDitherBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1120px] border-x-0 border-white/80 bg-background sm:border-x">
        <header className="border-b border-white/80">
          <div className="flex min-h-16 items-center justify-between gap-6 px-4 py-4 md:px-6">
            <div className="text-sm font-bold uppercase tracking-[0.28em]">
              Zapper
            </div>

            <nav className="hidden items-center gap-6 text-sm text-white/68 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <section className="border-b border-white/80">
          <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:divide-x lg:divide-white/80">
            <div className="px-4 py-12 md:px-6 md:py-16 lg:py-20">
              <div className="inline-flex border border-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
                Process manager for agents
              </div>

              <h1 className="mt-8 max-w-[10ch] text-4xl font-bold leading-[0.94] tracking-[-0.06em] text-balance sm:text-5xl lg:text-[4.25rem]">
                The process manager for agents.
              </h1>

              <p className="mt-6 max-w-[36rem] text-lg leading-8 text-white/72">
                Declarative, stateful, isolated per worktree. No PIDs, no
                long-lived terminals, no port clashes. Native processes and
                Docker containers, one yaml, one CLI.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href="https://docs.zapper.mp-lb.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center border border-white/80 px-4 text-sm font-medium text-white transition-colors hover:bg-white hover:text-black"
                >
                  Read the docs
                </a>

                <div className="inline-flex min-h-11 items-center border border-white/80 px-4 text-sm text-white/72">
                  <code className="overflow-x-auto whitespace-nowrap">
                    npm i -g @mp-lb/zapper
                  </code>
                </div>
              </div>
            </div>

            <aside className="flex flex-col">
              <div className="border-t border-white/80 px-4 py-6 lg:border-t-0 md:px-6">
                <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
                  Local runtime
                </div>
                <p className="mt-4 max-w-sm text-base leading-7 text-white/72">
                  A small control plane for local stacks that outlives the shell
                  that started it.
                </p>
              </div>

              <div className="border-t border-white/80">
                {runtimeRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid min-h-16 grid-cols-[88px_minmax(0,1fr)] border-b border-white/80 px-4 py-4 last:border-b-0 md:px-6"
                  >
                    <div className="pr-4 text-[11px] font-medium uppercase tracking-[0.28em] text-white/50">
                      {label}
                    </div>
                    <div className="text-sm leading-6 text-white/78">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/80 px-4 py-6 md:px-6">
                <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/50">
                  Basic commands
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-white/72">
                  <div>zap up</div>
                  <div>zap ls</div>
                  <div>zap logs api</div>
                  <div>zap open</div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-b border-white/80" id="cards">
          <div className="border-b border-white/80 px-4 py-5 md:px-6">
            <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
              Built for handoffs
            </div>
          </div>

          <div className="divide-y divide-white/80 lg:grid lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {cards.map((card) => (
              <article
                key={card.index}
                className="min-h-[270px] px-4 py-6 md:px-6"
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/50">
                  {card.index}
                </div>
                <h2 className="mt-8 max-w-[14ch] text-2xl font-bold leading-tight tracking-[-0.04em]">
                  {card.title}
                </h2>
                <p className="mt-5 text-sm leading-7 text-white/68">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="px-4 py-8 md:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-lg">
              <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/50">
                Footer
              </div>
              <p className="mt-4 text-xl font-bold leading-tight tracking-[-0.04em]">
                Give your agents a stack they can drive.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/68">
                One yaml. One CLI. Stateful, detached, isolated. Works just as
                well when the only agent at the keyboard is you.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/68">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
