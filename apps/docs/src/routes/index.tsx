import type { ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { gitConfig } from '@/lib/shared';
import { ClientOnly } from '@/components/client-only';
import { DemoShowcase } from '@/components/mugen-demo';
import { contractHtml } from '@/components/highlighted';

export const Route = createFileRoute('/')({
  component: Home,
});

const STATS: Array<[string, string]> = [
  ['O(log n)', 'updates'],
  ['0', 'reflows'],
  ['100k', 'rows'],
  ['±1px', 'vs the DOM'],
];

const FEATURES = [
  {
    title: 'Computed, not measured',
    body: 'Row heights come from pretext — text, font, and width — so there is no measure-on-mount pass and nothing jumps when the list paints.',
  },
  {
    title: 'Off-screen exactness',
    body: 'Per-row state lives outside React. Expand a collapsed row at index 9,000 and the scrollbar is correct immediately — without ever mounting it.',
  },
  {
    title: 'One source of truth',
    body: 'The same primitive tree is interpreted to measure and rendered to the DOM, so measurement and paint can never desync.',
  },
  {
    title: 'Logarithmic at any scale',
    body: 'A Fenwick offset index patches one changed row and finds the visible slice in a logarithm — smooth at a hundred thousand rows.',
  },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-fd-muted-foreground">
      {children}
    </p>
  );
}

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="mu-grid pointer-events-none absolute inset-0 -z-10" />
          <div className="mx-auto w-full max-w-5xl px-6 pt-20 pb-14 text-center">
            <span
              className="mu-rise inline-flex items-center gap-2 rounded-full border bg-fd-background/70 px-3 py-1 font-mono text-[11px] tracking-wide text-fd-muted-foreground backdrop-blur"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              powered by pretext
            </span>

            <h1
              className="mu-rise mx-auto mt-7 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl"
              style={{ animationDelay: '60ms' }}
            >
              Virtualized lists with heights you{' '}
              <span className="text-fd-primary underline decoration-fd-primary/25 decoration-dotted underline-offset-[8px]">
                compute
              </span>
              , not measure.
            </h1>

            <p
              className="mu-rise mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-fd-muted-foreground"
              style={{ animationDelay: '110ms' }}
            >
              <strong className="font-semibold text-fd-foreground">mugen</strong> derives every
              row&rsquo;s height arithmetically and renders the same description to the DOM — no
              measure-on-mount, no layout shift, and exact heights even for rows that never mounted.
            </p>

            <div
              className="mu-rise mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: '160ms' }}
            >
              <Link
                to="/docs/$"
                params={{ _splat: '' }}
                className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Get started
              </Link>
              <a
                href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
                className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
              >
                GitHub
              </a>
            </div>

            <div
              className="mu-rise mx-auto mt-11 flex max-w-2xl flex-wrap items-center justify-center gap-x-7 gap-y-2 font-mono text-xs text-fd-muted-foreground"
              style={{ animationDelay: '220ms' }}
            >
              {STATS.map(([v, k], i) => (
                <span key={k} className="inline-flex items-center gap-2">
                  {i > 0 ? <span className="mr-5 select-none opacity-25">/</span> : null}
                  <span className="tabular-nums text-fd-foreground">{v}</span>
                  <span>{k}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live demo ── */}
        <section className="mx-auto w-full max-w-3xl px-6 pb-8">
          <div className="mu-rise" style={{ animationDelay: '280ms' }}>
            <ClientOnly
              fallback={
                <div className="flex h-[560px] items-center justify-center rounded-xl border bg-fd-card font-mono text-sm text-fd-muted-foreground">
                  booting the list…
                </div>
              }
            >
              {() => <DemoShowcase />}
            </ClientOnly>
          </div>
          <p className="mt-3 text-center text-sm text-fd-muted-foreground">
            2,000 messages of wildly different lengths, fully virtualized. Heights are computed —
            &ldquo;Expand all&rdquo; resizes every row, on-screen or not, with zero DOM measurement.
          </p>
        </section>

        {/* ── Features ── */}
        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <Eyebrow>Why it&rsquo;s different</Eyebrow>
          <div className="grid gap-px overflow-hidden rounded-xl border bg-fd-border/60 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group bg-fd-background p-6 transition-colors hover:bg-fd-card"
              >
                <div className="font-mono text-xs text-fd-muted-foreground/70">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-3 font-medium tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Contract ── */}
        <section className="mx-auto w-full max-w-3xl px-6 pb-24">
          <Eyebrow>A list is one contract</Eyebrow>
          <div
            className="mu-code overflow-x-auto rounded-xl border bg-fd-card"
            dangerouslySetInnerHTML={{ __html: contractHtml }}
          />
          <div className="mt-10 text-center">
            <Link
              to="/docs/$"
              params={{ _splat: '' }}
              className="font-mono text-sm font-medium text-fd-primary hover:underline"
            >
              read the docs →
            </Link>
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}
