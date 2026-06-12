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

/** A plate on the sheet: hairline box with the content inside. Matches the
 *  demo window's radius so every plate on the page agrees. */
function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-xl border border-fd-border ${className}`}>{children}</div>;
}

function Figure({ n, label }: { n: string; label: string }) {
  return (
    <div className="mu-dim mt-4">
      <span className="shrink-0">
        <span className="text-fd-primary">fig. {n}</span>
        <span className="mx-2">—</span>
        {label}
      </span>
    </div>
  );
}

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col">
        {/* ── Hero: the title block of a drawing sheet ── */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="mu-grid pointer-events-none absolute inset-0 -z-10" />
          <div
            aria-hidden
            className="mu-ruler-y pointer-events-none absolute inset-y-0 left-4 hidden xl:block"
          />
          <div
            aria-hidden
            className="mu-ruler-y pointer-events-none absolute inset-y-0 right-4 hidden xl:block"
          />

          <div className="mx-auto w-full max-w-5xl px-6 pt-20 pb-12 text-center">
            <span className="mu-rise inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-fd-muted-foreground">
              <span className="size-1.5 rounded-full bg-fd-primary" />
              powered by pretext
            </span>

            <h1
              className="mu-rise mx-auto mt-8 max-w-4xl text-balance font-serif text-[2.9rem] font-normal leading-[1.04] tracking-[-0.005em] sm:text-[4.3rem]"
              style={{ animationDelay: '60ms' }}
            >
              Virtualized lists with heights
              <br className="hidden sm:block" /> you{' '}
              <em className="whitespace-nowrap text-fd-primary">compute</em>, not measure.
            </h1>

            <p
              className="mu-rise mx-auto mt-7 max-w-2xl text-balance text-lg leading-relaxed text-fd-muted-foreground"
              style={{ animationDelay: '110ms' }}
            >
              <strong className="font-semibold text-fd-foreground">mugen</strong> derives every
              row&rsquo;s height arithmetically and renders the same description to the DOM — no
              measure-on-mount, no layout shift, and exact heights even for rows that never
              mounted.
            </p>

            <div
              className="mu-rise mt-10 flex flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: '160ms' }}
            >
              <Link
                to="/docs/$"
                params={{ _splat: '' }}
                className="rounded-[3px] bg-fd-primary px-6 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-fd-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Get started
              </Link>
              <a
                href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
                className="rounded-[3px] border border-fd-border px-6 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-fd-foreground transition-colors hover:border-fd-primary/60 hover:text-fd-primary"
              >
                GitHub
              </a>
            </div>

            {/* Spec strip — the sheet's data row */}
            <div
              className="mu-rise mx-auto mt-12 max-w-3xl border-y border-fd-border"
              style={{ animationDelay: '220ms' }}
            >
              <div className="flex flex-wrap items-center justify-center gap-x-0 gap-y-2 px-2 py-3 font-mono text-xs text-fd-muted-foreground">
                {STATS.map(([v, k], i) => (
                  <span key={k} className="inline-flex items-center">
                    {i > 0 ? (
                      <span aria-hidden className="mx-6 select-none text-fd-primary">
                        +
                      </span>
                    ) : null}
                    <span className="tabular-nums text-fd-foreground">{v}</span>
                    <span className="ml-2 uppercase tracking-[0.1em] text-[10.5px]">{k}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Fig. 01 — the live demo, plated like a drawing ── */}
        <section className="mx-auto w-full max-w-3xl px-6 pb-6">
          <div className="mu-rise" style={{ animationDelay: '280ms' }}>
            {/* DemoShowcase draws its own window chrome — no extra frame, or the
                corners double up. */}
            <ClientOnly
              fallback={
                <div className="flex h-[560px] items-center justify-center rounded-xl border bg-fd-card font-mono text-sm text-fd-muted-foreground">
                  booting the list…
                </div>
              }
            >
              {() => <DemoShowcase />}
            </ClientOnly>
            <Figure n="01" label="live — every row a different height, none of them measured" />
          </div>
        </section>

        {/* ── Spec rows: why it's different ── */}
        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <h2 className="font-serif text-3xl">
            Why it&rsquo;s <em className="text-fd-primary">different</em>
          </h2>
          <div className="mt-8 border-t border-fd-border">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group grid gap-2 border-b border-fd-border py-6 sm:grid-cols-[7rem_1fr] sm:gap-6"
              >
                <div className="font-mono text-xs tabular-nums text-fd-muted-foreground transition-colors group-hover:text-fd-primary">
                  № {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="font-medium tracking-tight">{f.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-fd-muted-foreground">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Fig. 02 — the contract ── */}
        <section className="mx-auto w-full max-w-3xl px-6 pb-24">
          <h2 className="font-serif text-3xl">
            A list is one <em className="text-fd-primary">contract</em>
          </h2>
          <div className="mt-8">
            <Frame className="mu-code overflow-x-auto bg-fd-card">
              <div dangerouslySetInnerHTML={{ __html: contractHtml }} />
            </Frame>
            <Figure n="02" label="the same tree measures and paints — they cannot desync" />
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/docs/$"
              params={{ _splat: '' }}
              className="font-mono text-[12px] font-medium uppercase tracking-[0.18em] text-fd-primary hover:underline hover:underline-offset-4"
            >
              read the docs →
            </Link>
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}
