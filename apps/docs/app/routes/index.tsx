import type { Route } from './+types/index';
import { redirect } from 'react-router';

const docsUrl = import.meta.env.VITE_ZOG_DOCS_URL ?? '/docs';
const llmsUrl =
  import.meta.env.VITE_ZOG_DOCS_URL != null
    ? `${import.meta.env.VITE_ZOG_DOCS_URL}/llms-full.txt`
    : '/llms-full.txt';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Zog' },
    {
      name: 'description',
      content: 'A Zod-first MongoDB persistence boundary from MP Lab.',
    },
  ];
}

export function loader() {
  if (process.env.ZOG_SITE_MODE === 'docs') {
    throw redirect('/docs');
  }

  return null;
}

const navLinks = [
  { label: 'Docs', href: docsUrl },
  { label: 'LLMs', href: llmsUrl },
  { label: 'GitHub', href: 'https://github.com/mp-lb/zog' },
];

const boundaryRows = [
  ['Schema', 'Zod stays the source of truth'],
  ['Read path', 'Mongo document to parsed value'],
  ['Write path', 'Parsed value to canonical _id'],
  ['Legacy', 'Normalize old storage shapes before parse'],
];

const featureRows = [
  {
    index: '01',
    title: 'Mongo documents enter through Zod',
    body: 'Every repository read is parsed before application code sees it, so broken storage shape fails at the boundary.',
  },
  {
    index: '02',
    title: 'Application ids stay application ids',
    body: 'Keep your model in terms of id while Zog stores the same value canonically as Mongo _id.',
  },
  {
    index: '03',
    title: 'Indexes belong next to the model',
    body: 'Declare, diff, and sync Mongo indexes from the same place you define collection shape.',
  },
  {
    index: '04',
    title: 'Legacy shape has a home',
    body: 'Collection renames, old primary keys, and storage normalization stay outside your current schema.',
  },
];

const codeSample = `const userModel = createModel("users", userSchema, {
  primaryKey: "id",
  collectionName: "users",
  legacyCollectionNames: ["user_accounts"],
  indexes: [uniqueIndex({ email: 1 })],
});

const db = defineDb([userModel] as const, {
  mongoClient,
  databaseName: "app",
});

const user = await db.users.findById("user_1");`;

export default function Page() {
  return (
    <main className="zog-landing min-h-screen bg-black text-white">
      <div className="zog-noise" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-[1160px] border-x border-white/80 bg-black">
        <header className="border-b border-white/80">
          <div className="flex min-h-16 items-center justify-between gap-6 px-4 py-4 md:px-6">
            <a
              href="/"
              className="text-sm font-bold uppercase tracking-normal text-white"
            >
              Zog
            </a>

            <nav className="hidden items-center gap-6 text-sm text-white/68 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-white"
                  {...(link.href.startsWith('http')
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <section className="border-b border-white/80">
          <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] lg:divide-x lg:divide-white/80">
            <div className="flex flex-col justify-between px-4 py-10 md:px-6 md:py-14">
              <div>
                <div className="inline-flex border border-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-normal text-white/72">
                  Zod-first MongoDB
                </div>

                <h1 className="mt-8 max-w-[11ch] text-5xl font-black leading-none tracking-normal sm:text-6xl lg:text-7xl">
                  Zog
                </h1>

                <p className="mt-6 max-w-[38rem] text-lg leading-8 text-white/72">
                  A small persistence boundary for teams that want MongoDB to
                  feel like Zod, without teaching every schema about storage
                  history.
                </p>

                <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a
                    href={docsUrl}
                    className="inline-flex min-h-11 items-center justify-center border border-white/80 px-4 text-sm font-medium text-white transition-colors hover:bg-white hover:text-black"
                  >
                    Read the docs
                  </a>

                  <div className="inline-flex min-h-11 min-w-0 items-center border border-white/80 px-4 text-sm text-white/72">
                    <code className="overflow-x-auto whitespace-nowrap">
                      pnpm add @mp-lb/zog
                    </code>
                  </div>
                </div>
              </div>

              <div className="mt-12 grid border border-white/80 sm:grid-cols-2">
                {boundaryRows.map(([label, value], index) => (
                  <div
                    key={label}
                    className={[
                      'min-h-20 px-4 py-4',
                      index % 2 === 0 ? 'sm:border-r sm:border-white/80' : '',
                      index < 2 ? 'border-b border-white/80' : '',
                    ].join(' ')}
                  >
                    <div className="text-[11px] font-medium uppercase tracking-normal text-white/50">
                      {label}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/78">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="relative flex min-h-[520px] flex-col overflow-hidden border-t border-white/80 lg:border-t-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.13),transparent_34%)]" />
              <div className="relative flex flex-1 items-center justify-center px-4 py-8 md:px-6">
                <img
                  src="/brand/zog-frog.png"
                  alt="A melancholic white frog in a glass jar on a black background"
                  className="w-full max-w-[520px] object-contain"
                />
              </div>
              <div className="relative border-t border-white/80 px-4 py-5 md:px-6">
                <div className="text-[11px] font-medium uppercase tracking-normal text-white/50">
                  Current mood
                </div>
                <p className="mt-3 max-w-md text-sm leading-7 text-white/70">
                  Clean schemas. Old documents. One quiet frog keeping watch at
                  the storage boundary.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-b border-white/80">
          <div className="grid lg:grid-cols-[minmax(280px,0.62fr)_minmax(0,1.38fr)] lg:divide-x lg:divide-white/80">
            <div className="px-4 py-8 md:px-6">
              <div className="text-[11px] font-medium uppercase tracking-normal text-white/50">
                API surface
              </div>
              <h2 className="mt-6 max-w-[13ch] text-3xl font-black leading-tight tracking-normal">
                A collection that parses.
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/68">
                Zog keeps the repository API close to MongoDB while giving each
                model a typed, parsed boundary.
              </p>
            </div>

            <div className="overflow-x-auto bg-white/[0.035] px-4 py-8 md:px-6">
              <pre className="min-w-[620px] text-sm leading-7 text-white/78">
                <code>{codeSample}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className="border-b border-white/80">
          <div className="border-b border-white/80 px-4 py-5 md:px-6">
            <div className="text-[11px] font-medium uppercase tracking-normal text-white/72">
              Storage boundary
            </div>
          </div>

          <div className="divide-y divide-white/80 lg:grid lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {featureRows.map((feature) => (
              <article
                key={feature.index}
                className="min-h-[260px] px-4 py-6 md:px-6"
              >
                <div className="text-[11px] font-medium uppercase tracking-normal text-white/50">
                  {feature.index}
                </div>
                <h2 className="mt-8 max-w-[15ch] text-2xl font-black leading-tight tracking-normal">
                  {feature.title}
                </h2>
                <p className="mt-5 text-sm leading-7 text-white/68">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="px-4 py-8 md:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <div className="text-[11px] font-medium uppercase tracking-normal text-white/50">
                @mp-lb/zog
              </div>
              <p className="mt-4 text-xl font-black leading-tight tracking-normal">
                Better integration for Zod and MongoDB.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/68">
                Built for boring persistence problems: ids, indexes, collection
                names, and the legacy shapes that follow real products around.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/68">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-white"
                  {...(link.href.startsWith('http')
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
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
