import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  definePrimitive,
  HStack,
  MugenVList,
  type MugenInstance,
  Text,
  useMugenEffect,
  useMugenMemo,
  useMugenSelector,
  useMugenState,
  useMugenVirtualizer,
  VStack,
} from '@wingleeio/mugen';
import { Markdown, defineMarkdownComponents } from '@wingleeio/mugen-markdown';
import { Tooltip, Popover, Dropdown, Dialog } from '@wingleeio/mugen-ui';
import {
  chatHtml,
  accordionHtml,
  markdownHtml,
  mugenMarkdownHtml,
  aiChatHtml,
  bidirectionalPaginationHtml,
  overlaysHtml,
} from './components/highlighted';

const scrollCls = 'mu-scroll [&>div>div>div]:border-b [&>div>div>div]:border-fd-border/50';

/** A full-width clickable row, backed by a real <button>. */
const RowButton = definePrimitive('button', { name: 'RowButton' });
const buttonReset = {
  cursor: 'pointer',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  font: 'inherit',
  color: 'inherit',
} as const;

// ── Chat ──────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  author: string;
  color: string;
  text: string;
}

const MESSAGES: Msg[] = [
  { id: '1', author: 'Ada', color: '#6366f1', text: 'ship it 👍' },
  {
    id: '2',
    author: 'Grace',
    color: '#10b981',
    text: 'Heights come from the text, the font, and the width — measured by pretext, never the DOM. So nothing jumps when the list paints.',
  },
  { id: '3', author: 'Linus', color: '#f59e0b', text: 'ok' },
  {
    id: '4',
    author: 'Barbara',
    color: '#ec4899',
    text: 'One description feeds both the measurement and the render, so they cannot disagree by a pixel.',
  },
  { id: '5', author: 'Edsger', color: '#0ea5e9', text: 'elegant.' },
];

function ChatRow(item: Msg): ReactNode {
  return (
    <HStack gap={10} padding={11}>
      <VStack
        width={28}
        height={28}
        align="center"
        justify="center"
        style={{ borderRadius: 8, background: item.color }}
      >
        <Text font="600 12px Inter, sans-serif" lineHeight={16} color="white">
          {item.author[0]!}
        </Text>
      </VStack>
      <VStack gap={2}>
        <Text font="600 13px Inter, sans-serif" lineHeight={17}>
          {item.author}
        </Text>
        <Text color="var(--color-fd-muted-foreground)">{item.text}</Text>
      </VStack>
    </HStack>
  );
}

function ChatExample() {
  const list = useMugenVirtualizer({ items: MESSAGES });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      render={ChatRow}
      font="14px Inter, sans-serif"
      lineHeight={21}
      maxW={520}
      className={scrollCls}
    />
  );
}

// ── Accordion (useMugenState) ────────────────────────────────────────────────

interface Faq {
  id: string;
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  { id: '1', q: 'Does it measure the DOM?', a: 'No. Heights are computed from the text, font, and width with pretext — there is no measure-on-mount pass.' },
  { id: '2', q: 'What about off-screen rows?', a: 'Per-row state lives in the list instance, so a collapsed row far below the fold has an exact height the instant you ask — without mounting it.' },
  { id: '3', q: 'How fast are updates?', a: 'A Fenwick offset index makes a single-row height change and the visible-slice lookup both O(log n).' },
];

function FaqRow(item: Faq): ReactNode {
  const [open, setOpen] = useMugenState(false);
  return (
    <RowButton padding={13} onClick={() => setOpen((o) => !o)} style={buttonReset}>
      <VStack gap={6}>
        <HStack gap={8}>
          <Text font="600 14px Inter, sans-serif" lineHeight={20}>
            {open ? '−' : '+'}
          </Text>
          <Text font="600 14px Inter, sans-serif" lineHeight={20}>
            {item.q}
          </Text>
        </HStack>
        {open ? <Text color="var(--color-fd-muted-foreground)">{item.a}</Text> : null}
      </VStack>
    </RowButton>
  );
}

function AccordionExample() {
  const list = useMugenVirtualizer({ items: FAQS });
  return (
    <MugenVList
      instance={list}
      getKey={(f) => f.id}
      render={FaqRow}
      font="14px Inter, sans-serif"
      lineHeight={21}
      maxW={560}
      className={scrollCls}
    />
  );
}

// ── Bidirectional pagination ────────────────────────────────────────────────
//
// An audit-log feed paged in both directions. Rows are quiet, full-bleed,
// divider-separated entries (a kind dot + mono meta line + optional note rule);
// the top/bottom slots are measured like row content, so reaching either edge
// swaps in real shimmer skeletons while the page resolves, then settles to an
// exact height with no jump. Idle edges show a soft hint; exhausted edges an
// end-cap.

interface Activity {
  id: string;
  index: number;
  kind: 'deploy' | 'incident' | 'handoff' | 'maintenance';
  service: string;
  region: string;
  duration: string;
  title: string;
  body?: string;
  note?: string;
}

// One palette derived from the foreground, so the feed reads in both themes and
// stays consistent with the other recipes — no hard-coded slate/blue chrome.
const FEED = {
  fg: 'var(--color-fd-foreground)',
  muted: 'var(--color-fd-muted-foreground)',
  faint: 'color-mix(in oklab, var(--color-fd-foreground) 42%, transparent)',
  hairline: 'var(--color-fd-border)',
  rail: 'color-mix(in oklab, var(--color-fd-foreground) 16%, transparent)',
} as const;
const FEED_MONO = "'Geist Mono Variable', monospace";

// Full-bleed hairline between rows — a measured 1px line (not a CSS border, which
// the walker can't see), so real rows and skeletons separate the same way.
function Divider(): ReactNode {
  return <VStack height={1} style={{ background: FEED.hairline }} />;
}

// Each kind is one accent colour, carried by a small dot — not a filled badge.
const ACTIVITY_KINDS: Activity['kind'][] = ['deploy', 'handoff', 'incident', 'maintenance'];
const KINDS: Record<Activity['kind'], { label: string; color: string }> = {
  deploy: { label: 'DEPLOY', color: '#3b82f6' },
  incident: { label: 'INCIDENT', color: '#ef4444' },
  handoff: { label: 'HANDOFF', color: '#22c55e' },
  maintenance: { label: 'MAINT', color: '#f59e0b' },
};

const ACTIVITY_SERVICES = ['Billing API', 'Search workers', 'Edge cache', 'Model gateway', 'Docs deploy'];
const ACTIVITY_REGIONS = ['iad1', 'sfo3', 'fra1', 'sin2'];

// Bodies bucketed by length, so a row can be anything from a single compact line
// to a multi-paragraph entry — that height spread is the whole point of the demo.
const BODIES_SHORT = [
  'Promoted to 100%; no regressions in the canary window.',
  'Rolled back after the first synthetic probe failed.',
  'Acknowledged — no customer-facing impact.',
  'Cache warmed, then traffic shifted inside the window.',
];
const BODIES_MEDIUM = [
  'Canary traffic moved from 5% to 40% once the synthetic checkout path held inside the latency budget for ten consecutive minutes.',
  'The read replica rotated and the cache warmed before traffic shifted over, so the cutover stayed well inside the maintenance window.',
  'Release engineering handed the runbook to support at shift change, with the rollback window left open as a precaution.',
];
const BODIES_LONG = [
  'The retry queue crossed its warning threshold during a burst of webhook deliveries. Operators acknowledged the alert, drained the oldest partition by hand, and left the incident open until downstream delivery had fully caught up.',
  'The model gateway rejected a malformed batch, retried against the corrected schema, and attached the trace id for follow-up. Because the entry runs several clauses across multiple sentences, its measured height changes visibly as the column narrows — exactly the case a fixed-height virtualiser gets wrong.',
  'A long-running migration backfilled the new index in the background while reads continued against the old one. The cutover flipped a single feature flag, the verification suite went green on the second pass, and the rollback path stayed warm for the rest of the shift in case p99 latency drifted afterward.',
];
const ACTIVITY_NOTES = [
  'Follow-up: compare p95 search latency after the next index compaction.',
  'Customer-facing status stayed green; only the internal retry queue crossed threshold.',
  'Rollback stayed available for 14 minutes after the final probe.',
  'Paging policy updated: route gateway timeouts to the on-call SRE first, then the service owner if unacknowledged within five minutes — the previous order added a full handoff hop during the last incident.',
];

// A repeating rhythm of row shapes so adjacent rows differ a lot in height: some
// are just a header, some a one-liner, some a paragraph, some a paragraph plus a
// follow-up note. Cycled by index (no Math.random, so SSR and client agree).
const ROW_SHAPES: { body: 'none' | 'short' | 'medium' | 'long'; note: boolean }[] = [
  { body: 'medium', note: false },
  { body: 'none', note: false },
  { body: 'long', note: true },
  { body: 'short', note: false },
  { body: 'none', note: true },
  { body: 'long', note: false },
  { body: 'medium', note: true },
  { body: 'short', note: false },
  { body: 'long', note: true },
  { body: 'medium', note: false },
  { body: 'short', note: true },
];

function pickBody(shape: 'none' | 'short' | 'medium' | 'long', index: number): string | undefined {
  switch (shape) {
    case 'none':
      return undefined;
    case 'short':
      return BODIES_SHORT[index % BODIES_SHORT.length];
    case 'medium':
      return BODIES_MEDIUM[index % BODIES_MEDIUM.length];
    case 'long':
      return BODIES_LONG[index % BODIES_LONG.length];
  }
}

function makeActivity(index: number): Activity {
  const kind = ACTIVITY_KINDS[index % ACTIVITY_KINDS.length]!;
  const service = ACTIVITY_SERVICES[index % ACTIVITY_SERVICES.length]!;
  const shape = ROW_SHAPES[index % ROW_SHAPES.length]!;
  return {
    id: `event-${index}`,
    index,
    kind,
    service,
    region: ACTIVITY_REGIONS[index % ACTIVITY_REGIONS.length]!,
    duration: `${(index % 7) + 2}m ${((index * 11) % 60).toString().padStart(2, '0')}s`,
    title:
      kind === 'deploy'
        ? `${service} release #${index} promoted`
        : kind === 'incident'
          ? `${service} alert #${index} acknowledged`
          : kind === 'handoff'
            ? `${service} handoff recorded`
            : `${service} maintenance window`,
    body: pickBody(shape.body, index),
    note: shape.note ? ACTIVITY_NOTES[index % ACTIVITY_NOTES.length] : undefined,
  };
}

function makeActivityRange(start: number, end: number): Activity[] {
  return Array.from({ length: end - start + 1 }, (_, i) => makeActivity(start + i));
}

function ActivityRow(item: Activity): ReactNode {
  const tone = KINDS[item.kind];
  return (
    <VStack>
      <VStack gap={9} padding={16}>
        {/* title (grows) + index pinned right — one flexible child keeps the
            measured width equal to the painted one. */}
        <HStack gap={12} align="flex-start" justify="space-between">
          <Text font="600 14px Inter, sans-serif" lineHeight={20} color={FEED.fg}>
            {item.title}
          </Text>
          <VStack width={46} align="flex-end">
            <Text font={`500 11px ${FEED_MONO}`} lineHeight={20} color={FEED.faint}>
              {`#${item.index}`}
            </Text>
          </VStack>
        </HStack>
        {/* kind dot + a single mono meta line (the colour lives in the dot). */}
        <HStack gap={9} align="center">
          <VStack
            width={8}
            height={8}
            style={{
              borderRadius: 999,
              background: tone.color,
              boxShadow: `0 0 0 4px color-mix(in oklab, ${tone.color} 18%, transparent)`,
            }}
          />
          <Text
            font={`500 11px ${FEED_MONO}`}
            lineHeight={15}
            letterSpacing={0.2}
            color={FEED.muted}
          >
            {`${tone.label} · ${item.service} · ${item.region} · ${item.duration}`}
          </Text>
        </HStack>
        {item.body ? <Text color={FEED.muted}>{item.body}</Text> : null}
        {item.note ? (
          <HStack gap={11} align="stretch">
            <VStack width={2} style={{ borderRadius: 2, background: FEED.rail }} />
            <Text font="500 12.5px Inter, sans-serif" lineHeight={18} color={FEED.muted}>
              {item.note}
            </Text>
          </HStack>
        ) : null}
      </VStack>
      <Divider />
    </VStack>
  );
}

/** A shimmering placeholder bar. Box (width/height) is owned by props so it
 *  measures exactly; the sweep is a decorative CSS overlay (`.mu-skeleton`).
 *  A fixed `w` renders `flex: 0 0 w` on the main axis — so a width-bearing Bar
 *  must sit inside an `HStack` (where the main axis is horizontal). In a column
 *  it would pin the *height* instead; `SkeletonLine` handles that wrap. */
function Bar({ w, h, radius = 6 }: { w?: number; h: number; radius?: number }): ReactNode {
  return (
    <VStack {...(w != null ? { width: w } : null)} height={h} className="mu-skeleton" style={{ borderRadius: radius }} />
  );
}

/** A body placeholder line, safe to stack in a column. A full-width line is a
 *  bare Bar; a partial line is wrapped in an `HStack` so its width applies to
 *  the horizontal axis (not the height). */
function SkeletonLine({ w }: { w?: number }): ReactNode {
  return w == null ? (
    <Bar h={9} />
  ) : (
    <HStack>
      <Bar w={w} h={9} />
    </HStack>
  );
}

// A few placeholder rows of varied shape, so a loading page reads as content.
const SKELETON_ROWS: { title: number; lines: (number | undefined)[] }[] = [
  { title: 188, lines: [undefined, undefined, 236] },
  { title: 142, lines: [undefined, 272] },
];

function SkeletonRow({ title, lines }: { title: number; lines: (number | undefined)[] }): ReactNode {
  return (
    <VStack>
      <VStack gap={11} padding={16}>
        <HStack gap={12} align="center" justify="space-between">
          <Bar w={title} h={12} />
          <Bar w={30} h={10} />
        </HStack>
        <HStack gap={9} align="center">
          <Bar w={8} h={8} radius={999} />
          <Bar w={156} h={9} />
        </HStack>
        <VStack gap={9}>
          {lines.map((w, i) => (
            <SkeletonLine key={i} w={w} />
          ))}
        </VStack>
      </VStack>
      <Divider />
    </VStack>
  );
}

function PaginationSlot({
  edge,
  loading,
  done,
}: {
  edge: 'top' | 'bottom';
  loading: boolean;
  done: boolean;
}): ReactNode {
  const isTop = edge === 'top';
  if (loading) {
    // Real skeletons fill the incoming page while it resolves. Each one draws its
    // own trailing divider, so they separate cleanly from the rows on either side.
    return (
      <VStack>
        {SKELETON_ROWS.map((s, i) => (
          <SkeletonRow key={i} title={s.title} lines={s.lines} />
        ))}
      </VStack>
    );
  }
  const label = done
    ? isTop
      ? 'BEGINNING OF HISTORY'
      : 'YOU’RE ALL CAUGHT UP'
    : isTop
      ? '↑  Scroll up for older events'
      : '↓  Scroll down for newer events';
  const band = (
    <VStack padding={done ? 18 : 14} align="center">
      <Text font={`500 11px ${FEED_MONO}`} lineHeight={15} letterSpacing={done ? 0.6 : 0.2} color={FEED.faint}>
        {label}
      </Text>
    </VStack>
  );
  // Only the top band draws a divider (below itself, to split from the first
  // row). A bottom band sits under a row that already drew its trailing divider —
  // adding another here is the double line.
  return isTop ? (
    <VStack>
      {band}
      <Divider />
    </VStack>
  ) : (
    band
  );
}

// The full event history the feed pages through (indices 0…LAST_INDEX). The list
// only ever holds the loaded window — scrolling to an edge fetches the next page
// in that direction until the history is exhausted.
const LAST_INDEX = 959;

function BidirectionalPaginationExample() {
  // Open on a window in the middle of the history, so there are hundreds of
  // events to page through in either direction.
  const [range, setRange] = useState({ start: 480, end: 511 });
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingBottom, setLoadingBottom] = useState(false);
  const items = useMemo(() => makeActivityRange(range.start, range.end), [range]);
  const list = useMugenVirtualizer({ items });
  const canLoadOlder = range.start > 0;
  const canLoadNewer = range.end < LAST_INDEX;

  const loadOlder = () => {
    if (loadingTop || !canLoadOlder) return;
    setLoadingTop(true);
    setTimeout(() => {
      setRange((r) => ({ ...r, start: Math.max(0, r.start - 12) }));
      setLoadingTop(false);
    }, 650);
  };

  const loadNewer = () => {
    if (loadingBottom || !canLoadNewer) return;
    setLoadingBottom(true);
    setTimeout(() => {
      setRange((r) => ({ ...r, end: Math.min(LAST_INDEX, r.end + 12) }));
      setLoadingBottom(false);
    }, 650);
  };

  return (
    <MugenVList
      instance={list}
      getKey={(item) => item.id}
      render={ActivityRow}
      renderTop={() => (
        <PaginationSlot edge="top" loading={loadingTop} done={!canLoadOlder} />
      )}
      renderBottom={() => (
        <PaginationSlot edge="bottom" loading={loadingBottom} done={!canLoadNewer} />
      )}
      onTopReached={loadOlder}
      onBottomReached={loadNewer}
      topReachedThreshold={24}
      bottomReachedThreshold={24}
      initialScroll={{ to: 'index', index: 10, align: 'center' }}
      font="13.5px Inter, sans-serif"
      lineHeight={20}
      overscan={360}
      className="mu-scroll"
      style={{ background: 'var(--color-fd-background)' }}
    />
  );
}

// ── Markdown (useMugenEffect, live) ──────────────────────────────────────────

interface Note {
  id: string;
  md: string;
}

const NOTES: Note[] = [
  { id: '1', md: 'Effects transform content into state off the measure pass. This note "parses" after a beat — watch the row grow to its exact height with no layout shift. The scrollbar re-anchors as each block resolves.' },
  { id: '2', md: 'A second note, shorter.' },
  { id: '3', md: 'Markdown, syntax highlighting, async loads — all fit this shape: watch some inputs, do the work, store the result with useMugenState, and mugen re-measures the affected rows for you.' },
];

function NoteRow(item: Note): ReactNode {
  const [blocks, setBlocks] = useMugenState<string[] | null>(null);
  useMugenEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setBlocks(item.md.split(/(?<=\.)\s+/).filter(Boolean));
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [item.md]);

  if (blocks === null) {
    return (
      <VStack padding={13}>
        <Text color="var(--color-fd-muted-foreground)">parsing…</Text>
      </VStack>
    );
  }
  return (
    <VStack gap={8} padding={13}>
      {blocks.map((b, i) => (
        <Text key={i}>{b}</Text>
      ))}
    </VStack>
  );
}

function MarkdownExample() {
  const list = useMugenVirtualizer({ items: NOTES });
  return (
    <MugenVList
      instance={list}
      getKey={(n) => n.id}
      render={NoteRow}
      font="14px Inter, sans-serif"
      lineHeight={22}
      maxW={560}
      className={scrollCls}
    />
  );
}

// ── AI chat with thinking, tool calls & streaming ────────────────────────────
//
// A Claude / ChatGPT-style transcript rendered through a real MugenVList:
// right-aligned user bubbles, clean full-width assistant turns, a collapsible
// "Thought for…" reasoning trace (useMugenState), tool-use cards with crisp
// line icons, and a final turn that "works" then streams its answer in
// (useMugenEffect). Every turn is a pure item → tree, so off-screen turns have
// exact heights and expanding a trace re-measures only that one row.

type ToolKind = 'search' | 'read' | 'run' | 'web';

interface Tool {
  kind: ToolKind;
  title: string;
  detail?: string;
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  /** Body as markdown — rendered with @wingleeio/mugen-markdown, measured by the walker. */
  body: string;
  /** Assistant only: the collapsed reasoning trace. */
  thinking?: string;
  /** Assistant only: caption for the disclosure, e.g. "2.7s". */
  thoughtFor?: string;
  /** Assistant only: the tool-use cards. */
  tools?: Tool[];
  /** The final turn "works", then streams its answer in. */
  live?: boolean;
}

const AC = {
  accent: '#6366f1',
  done: '#10b981',
  active: '#f59e0b',
  fg: 'var(--color-fd-foreground)',
  muted: 'var(--color-fd-muted-foreground)',
  page: 'var(--color-fd-background)',
  hairline: 'color-mix(in oklab, var(--color-fd-foreground) 10%, transparent)',
  card: 'color-mix(in oklab, var(--color-fd-foreground) 4%, transparent)',
  bubble: 'color-mix(in oklab, var(--color-fd-foreground) 6%, transparent)',
  rule: 'color-mix(in oklab, var(--color-fd-foreground) 20%, transparent)',
} as const;

const MONO = "'Geist Mono Variable', monospace";

// Markdown styling tuned to the assistant turn's palette. A stable module-level
// object so the theme resolves (and caches) once.
const CHAT_MD_THEME = {
  fontFamily: 'Inter',
  monoFamily: '"Geist Mono Variable", monospace',
  fontSize: 15,
  lineHeight: 24,
  color: AC.fg,
  blockGap: 12,
  heading: { color: AC.fg, weight: 650 },
  link: { color: AC.accent, underline: true },
  inlineCode: { background: AC.card, color: AC.fg, sizeScale: 0.9 },
  code: { background: AC.card, color: AC.fg, padding: 12, radius: 10, fontSize: 13, lineHeight: 20 },
  blockquote: { borderColor: AC.rule, color: AC.muted, padding: 12, gap: 8, borderWidth: 3 },
  list: { gap: 6, indent: 24, markerColor: AC.muted },
};

/** Clickable header for the reasoning disclosure (a real <button>). */
const Disclosure = definePrimitive('button', { name: 'Disclosure' });

// Crisp line icons, rendered as a CSS mask so they take the element's color
// (theme-aware) and a fixed box (measurement-safe). 24×24 stroked paths.
const ICONS: Record<ToolKind, string> = {
  search:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='7'/><path d='m20 20-3.4-3.4'/></svg>",
  read:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'/><path d='M14 3v6h6'/><path d='M9 13h6M9 17h4'/></svg>",
  run:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='16' rx='2'/><path d='m7 9 3 3-3 3M13 15h4'/></svg>",
  web:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M3 12h18'/><path d='M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z'/></svg>",
};

const mask = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function ToolIcon({ kind }: { kind: ToolKind }): ReactNode {
  return (
    <VStack
      width={28}
      height={28}
      align="center"
      justify="center"
      style={{ background: AC.card, borderRadius: 8, boxShadow: `inset 0 0 0 1px ${AC.hairline}` }}
    >
      <VStack
        width={15}
        height={15}
        style={{
          background: AC.muted,
          maskImage: mask(ICONS[kind]),
          WebkitMaskImage: mask(ICONS[kind]),
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    </VStack>
  );
}

function ToolCard({ tool, running }: { tool: Tool; running?: boolean }): ReactNode {
  return (
    <HStack
      gap={11}
      padding={10}
      align="center"
      justify="space-between"
      style={{ background: AC.card, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${AC.hairline}` }}
    >
      <HStack gap={11} align="center">
        <ToolIcon kind={tool.kind} />
        <VStack gap={2}>
          <Text font="500 13px Inter, sans-serif" lineHeight={18} color={AC.fg}>
            {tool.title}
          </Text>
          {tool.detail ? (
            <Text font={`11.5px ${MONO}`} lineHeight={16} color={AC.muted}>
              {tool.detail}
            </Text>
          ) : null}
        </VStack>
      </HStack>
      <VStack width={18} align="center" justify="center">
        <Text
          font="600 13px Inter, sans-serif"
          lineHeight={16}
          color={running ? AC.active : AC.done}
          className={running ? 'mu-pulse' : undefined}
        >
          {running ? '◐' : '✓'}
        </Text>
      </VStack>
    </HStack>
  );
}

function Reasoning({ text }: { text: string }): ReactNode {
  // Claude/ChatGPT-style: just a thin left rule and muted text — no card, no
  // border. `align="stretch"` makes the 2px rail fill the text's height; it
  // measures as 0 so it never affects the row height.
  return (
    <HStack gap={13} align="stretch">
      <VStack width={2} style={{ background: AC.rule, borderRadius: 2 }} />
      <Text font="14px Inter, sans-serif" lineHeight={23} color={AC.muted}>
        {text}
      </Text>
    </HStack>
  );
}

function UserTurn({ item }: { item: Turn }): ReactNode {
  // The bubble's `width` must live inside an HStack: `width` renders as
  // `flex: 0 0 Wpx`, whose basis applies to the row's main axis (the width).
  // In a VStack (column) that basis would instead pin the *height*.
  return (
    <HStack padding={14} justify="flex-end">
      <VStack
        width={430}
        padding={14}
        gap={3}
        style={{ background: AC.bubble, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${AC.hairline}` }}
      >
        <Markdown source={item.body} theme={CHAT_MD_THEME} />
      </VStack>
    </HStack>
  );
}

function TurnRow(item: Turn): ReactNode {
  const isLive = !!item.live;

  // Reasoning starts open on the "live" turn so you catch it working.
  const [open, setOpen] = useMugenState(isLive);

  // The live turn streams its answer in, word by word: useMugenEffect drives a
  // timer, useMugenState holds how many words are revealed, and the row
  // re-measures on each tick — so stickToBottom can follow it down smoothly.
  // The growing markdown prefix is re-parsed incrementally by <Markdown> (it
  // appends only the new words to a retained incremark parser), and the walker
  // re-measures the row exactly as blocks resolve.
  const words = item.body.split(' ');
  const totalWords = words.length;
  const [revealed, setRevealed] = useMugenState(isLive ? 0 : totalWords);
  useMugenEffect(() => {
    if (!isLive) return;
    // Reveal a few words per tick, scaled so any length streams in ~12s.
    const step = Math.max(1, Math.ceil(totalWords / 200));
    let n = 0;
    const id = setInterval(() => {
      n += step;
      setRevealed(Math.min(n, totalWords));
      if (n >= totalWords) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [item.id]);

  if (item.role === 'user') return <UserTurn item={item} />;

  const streaming = isLive && revealed < totalWords;
  // A clean growing prefix keeps parsing incremental; the caret is a sibling so
  // it doesn't break the prefix relationship between ticks.
  const source = isLive ? words.slice(0, revealed).join(' ') : item.body;

  // Memoize the chrome that doesn't depend on the streaming `revealed` state so
  // it keeps a *stable element reference* across ticks — React then bails out of
  // re-rendering it, and only the streaming body updates each tick. (React.memo
  // can't be used here: mugen's measure walker only handles plain components.)
  const thinkingEl = useMugenMemo(
    () =>
      item.thinking ? (
        <VStack gap={open ? 9 : 0}>
          <Disclosure padding={2} onClick={() => setOpen((o) => !o)} style={{ ...buttonReset, borderRadius: 8 }}>
            <HStack gap={7} align="center">
              <Text font={`600 11px ${MONO}`} lineHeight={16} color={AC.muted}>
                {open ? '▾' : '▸'}
              </Text>
              <Text font={`500 11.5px ${MONO}`} lineHeight={16} color={AC.muted}>
                {`Thought for ${item.thoughtFor ?? '3.0s'}`}
              </Text>
            </HStack>
          </Disclosure>
          {open ? <Reasoning text={item.thinking} /> : null}
        </VStack>
      ) : null,
    [open],
  );

  // Tool cards only change when streaming flips (the last card's running ✓/◐).
  const toolsEl = useMugenMemo(
    () =>
      item.tools ? (
        <VStack gap={7}>
          {item.tools.map((t, i) => (
            <ToolCard key={i} tool={t} running={streaming && i === item.tools!.length - 1} />
          ))}
        </VStack>
      ) : null,
    [streaming],
  );

  return (
    <VStack gap={12} padding={20}>
      {thinkingEl}
      {toolsEl}
      <VStack gap={4}>
        <Markdown source={source} theme={CHAT_MD_THEME} />
        {streaming ? (
          <Text font="600 15px Inter, sans-serif" lineHeight={24} color={AC.accent} className="mu-pulse">
            ▍
          </Text>
        ) : null}
      </VStack>
    </VStack>
  );
}

// The most recent stretch of the session — shown first since the list opens at
// the bottom. A few thousand generated turns are prepended before it (below).
const TAIL: Turn[] = [
  {
    id: '1',
    role: 'user',
    body: 'I need an inbox that scrolls **50,000 emails** without jank, and some rows expand inline. Where do I start?',
  },
  {
    id: '2',
    role: 'assistant',
    thoughtFor: '2.4s',
    thinking:
      'The hard part isn’t painting 50k rows — it’s knowing every row’s height without mounting it, so the scrollbar and scroll position stay honest. mugen computes heights from text + font + width, so I can virtualize and still allow inline expansion.',
    tools: [
      { kind: 'read', title: 'Read the concepts guide', detail: 'concepts.mdx · 180 lines' },
      { kind: 'search', title: 'Searched the API', detail: 'useMugenVirtualizer, MugenVList' },
    ],
    body:
      "Start with one virtualizer over your data, then render rows through `MugenVList`:\n\n```tsx\nconst list = useMugenVirtualizer({ items: emails });\n```\n\nBecause heights are **computed** — not measured on mount — the list knows its full scroll height up front, so **50k rows scroll as smoothly as five**.",
  },
  {
    id: '3',
    role: 'user',
    body: 'Some rows open a reply box when clicked. Won’t expanding a row above the viewport shove everything and lose my scroll position?',
  },
  {
    id: '4',
    role: 'assistant',
    thoughtFor: '3.1s',
    thinking:
      'Expansion changes one row’s height. A Fenwick offset index makes that an O(log n) patch, and the visible slice is recomputed from the new offsets — so rows under the cursor stay put. Off-screen rows have exact heights too, since per-row state lives in the instance.',
    tools: [
      { kind: 'search', title: 'Traced setMugenState → re-measure', detail: 'instance.ts' },
      { kind: 'run', title: 'Profiled a 1-row height change', detail: 'O(log n) · 0.04ms' },
    ],
    body:
      "No — keep the open/closed flag in `useMugenState`. Toggling:\n\n- re-measures **just that row**\n- patches the Fenwick offset index in `O(log n)`\n- leaves everything above the fold put\n\nTry it right here: open a *“Thought for…”* trace above and watch the list re-flow without losing your place.",
  },
  {
    id: '5',
    role: 'user',
    body: 'How can the heights be exact if you never touch the DOM?',
  },
  {
    id: '6',
    role: 'assistant',
    thoughtFor: '1.9s',
    thinking:
      'pretext does a canvas-based text layout: segment the string, measure runs at the row’s width, divide by line-height. The expensive prepare() pass is cached per (font, text); a resize is then just arithmetic over the cached metrics.',
    tools: [
      { kind: 'run', title: 'Measured a paragraph with pretext', detail: 'prepare() cached · layout 0.2ms' },
    ],
    body:
      "One description feeds **both** the measurement walk and the React render, so they can’t disagree by a pixel — the height you compute is the height that paints.\n\n> The font `pretext` measures with is the font the CSS paints with.",
  },
  {
    id: '7',
    role: 'user',
    body: 'Rows have avatars on the left and a growing text column on the right. How do I lay that out?',
  },
  {
    id: '8',
    role: 'assistant',
    thoughtFor: '2.0s',
    thinking:
      'HStack with a fixed-width avatar and a flexible text column: fixed siblings keep their width, the rest share the remainder. Spacing is props (gap/padding), never CSS, so the walker counts it exactly.',
    tools: [
      { kind: 'read', title: 'Read the primitives reference', detail: 'VStack, HStack, Text' },
    ],
    body:
      "An `HStack` with a fixed-width avatar and a flexible text column:\n\n```tsx\n<HStack gap={12}>\n  <VStack width={36} height={36} />\n  <VStack>{/* text */}</VStack>\n</HStack>\n```\n\nFixed siblings keep their width; the rest share the remainder. Spacing is **props**, never CSS, so the walker counts it exactly.",
  },
  {
    id: '9',
    role: 'user',
    body: 'Each email body is **markdown**. Can a row resize after it renders?',
  },
  {
    id: '10',
    role: 'assistant',
    thoughtFor: '2.6s',
    thinking:
      'Render it with @wingleeio/mugen-markdown: incremark parses the body, mugen primitives render it, and the walker measures every block — including off-screen rows. Streaming bodies re-parse incrementally.',
    tools: [
      { kind: 'read', title: 'Read the effects guide', detail: 'effects.mdx' },
      { kind: 'run', title: 'Rendered a markdown row', detail: '0 layout shift' },
    ],
    body:
      "Yes — render it with `@wingleeio/mugen-markdown`. It parses with incremark and renders **mugen primitives**, so headings, lists, fenced code, and inline `code` are all measured by the walker:\n\n```tsx\n<Markdown source={email.body} />\n```\n\nOff-screen rows get exact heights too — no measure-on-mount shift.",
  },
  {
    id: '11',
    role: 'user',
    body: 'What fonts can I use, and does the measurement track them?',
  },
  {
    id: '12',
    role: 'assistant',
    thoughtFor: '1.6s',
    thinking:
      'Font is a CSS/canvas shorthand with an explicit size — "15px Inter", "600 14px Inter". system-ui is rejected because it isn’t deterministically measurable. A font-load epoch invalidates the cache and re-measures when a webfont arrives.',
    tools: [
      { kind: 'read', title: 'Read the fonts page', detail: 'fonts.mdx' },
      { kind: 'web', title: 'Checked the canvas text metrics spec', detail: 'measureText()' },
    ],
    body:
      'Any real family with a size: `font="600 15px Inter"`. `system-ui` is rejected — its metrics aren’t deterministic.\n\nWhen a webfont finishes loading, mugen bumps a **font epoch** and re-measures the rows that used it, so layout settles to the exact metrics.',
  },
  {
    id: '13',
    role: 'user',
    body: 'Does it hold up at a **million** rows, or is 50k the ceiling?',
  },
  {
    id: '14',
    role: 'assistant',
    thoughtFor: '2.9s',
    thinking:
      'Everything hot is O(log n): the offset index for height patches and the binary search for the visible slice. Memory is one entry per row, not per DOM node. A million rows is bound by your data, not the list.',
    tools: [
      { kind: 'run', title: 'Benchmarked 1,000,000 rows', detail: '60fps scroll · ~12ms initial' },
    ],
    body:
      'It holds. Everything hot is `O(log n)`:\n\n1. the offset index for height patches\n2. the binary search for the visible slice\n\nOnly the visible slice mounts, so a million rows scroll like a thousand — **your data size is the real ceiling**.',
  },
  {
    id: '15',
    role: 'user',
    body: 'Last thing: can I deep-link to message **#41,212** and have it land centered on the first try?',
  },
  {
    id: '16',
    role: 'assistant',
    live: true,
    thoughtFor: '2.7s',
    thinking:
      'scrollToItem resolves the row’s offset from the index — already known for every row, on-screen or not — so it lands pixel-exact with align: "center", even for a row that has never mounted. No measure-on-arrival, no second correction.',
    tools: [
      { kind: 'search', title: 'Looked up the offset for #41,212', detail: 'index hit · O(log n)' },
      { kind: 'run', title: 'Computed the centered scroll target', detail: 'align: center' },
    ],
    body:
      'Yes — and it lands on the very first try:\n\n```tsx\nlist.scrollToItem("41212", { align: "center", behavior: "smooth" });\n```\n\nBecause every row’s offset already lives in the index, it’s **dead-center** immediately — no measure-on-arrival, no second correction, no scrollbar jump.\n\n## Putting it all together\n\nHere’s the whole flow, end to end. Every row is a pure `item → tree`, the walker derives its height analytically, and **nothing ever touches the DOM to measure**.\n\n### What you get\n\n- **Exact heights up front** — even for rows that never mount\n- **O(log n)** scroll math via a Fenwick offset index\n- **Zero layout shift** — one description feeds both measure *and* render\n- Pixel-exact `scrollToItem`, on- or off-screen\n- Streaming markdown that re-parses *incrementally* as it grows\n\n### Setting it up\n\n1. Create one virtualizer over your data\n2. Render each row through `MugenVList`\n3. Author the row from primitives — or drop in `<Markdown>`\n4. Keep height-affecting state in `useMugenState`\n\n```tsx\nconst list = useMugenVirtualizer({ items: messages });\n\nreturn (\n  <MugenVList\n    instance={list}\n    getKey={(m) => m.id}\n    render={(m) => <Markdown source={m.body} />}\n    initialScroll="bottom"\n    stickToBottom\n  />\n);\n```\n\n### Why it scales\n\n| rows | what mounts | scroll |\n|------|-------------|--------|\n| 1k | visible slice | 60fps |\n| 50k | visible slice | 60fps |\n| 1M | visible slice | 60fps |\n\nOnly the visible window mounts, so the row *count* stops being the bottleneck — your data is.\n\n> One description of a row feeds both the measurement walk and the React render, so the height you compute is the height that paints.\n\nAnd streaming? The answer you’re reading **streamed in word by word** just now:\n\n1. each chunk appended to a retained incremark parser (`O(delta)`)\n2. the walker re-measured *this one row*\n3. `stickToBottom` followed it down — until you scroll up to break free\n\nThat’s the entire idea: heights are *computed*, not measured; markdown is *parsed incrementally*, not re-parsed; and the list stays honest whether it’s **5 messages or a million**.',
  },
];

// ── Synthetic history ────────────────────────────────────────────────────────
// Pools cycled by index (no Math.random, so server and client agree on the
// markup) into a few thousand believable turns of varied height. Scroll up from
// the bottom to see them — and to watch O(log n) virtualization in action.

const HISTORY_USER: string[] = [
  'Can the list virtualize a feed where every item is a different height?',
  'What happens to my scroll position when an image finishes loading in a row above me?',
  'Do I have to give every row a fixed height? My content is all over the place.',
  'How do I render a chat where some bubbles are one word and others are paragraphs?',
  'Can I jump to an arbitrary message without mounting everything in between?',
  'My rows have a header, a body, and sometimes a footer. Will the heights still be exact?',
  'Can I keep per-row state like an expanded flag without re-rendering the whole list?',
  'What does it cost to insert a message at the top while I’m scrolled to the bottom?',
  'Does resizing the window re-measure everything, or is it cheaper than that?',
  'How do code blocks with long lines affect the measured width?',
  'If a row’s text changes after a translation loads, does the height update on its own?',
  'Can two columns share the leftover width while a fixed avatar keeps its size?',
  'Is there a measure-on-mount flash when I first paint the list?',
  'How many rows can this handle before scrolling starts to chug?',
];

const HISTORY_ASST: string[] = [
  'Yes — heights come from the text, font, and column width, so **every row can differ** and the list still knows its full scroll height up front.',
  'It stays put. The height change is an `O(log n)` patch to the offset index and the visible slice is recomputed from the new offsets, so nothing under your cursor jumps.',
  'No fixed heights. You describe each row as a tree of primitives and the walker derives the height analytically — one description feeds both the measure and the render.',
  'Render the bubble as a `VStack` of `Text`. A one-word bubble measures to a single line, a paragraph wraps to many — both exact, because the column width drives the wrap.',
  '`scrollToItem` resolves the row’s offset from the index without mounting anything in between, so it lands in one jump even for a row that has never rendered.',
  'Exact. The header, body, and optional footer are primitives with gaps and padding the walker counts, so the total is their sum **to the pixel**.',
  'Keep the flag in `useMugenState`. Toggling re-measures just that row and patches the index; the rest of the list never re-renders.\n\nOff-screen rows keep their state in the instance, so their heights are right before you ever scroll to them.',
  'Cheap — a prepend shifts one entry in the Fenwick tree and re-anchors your scroll by the inserted height, so the bottom stays exactly where you left it.',
  'Cheaper. A resize is **pure arithmetic** over the cached per-string metrics — no re-layout, no DOM reads — so it re-flows in a few milliseconds even for a big list.',
  'The column width sets the wrap point. For code you cap the width and scroll horizontally inside the row; the measured height just follows whichever you pick.',
  'On its own — swap the text in `useMugenEffect`, store it with `useMugenState`, and the affected rows re-measure to their new heights with **zero layout shift**.',
  'Yes. Give the avatar a fixed width and let the text column take the remainder: fixed siblings keep their size, the rest share what’s left.',
  'No flash. Heights are computed before paint, so the scrollbar and offsets are correct on the very first frame — there’s no mount-then-measure correction.',
  'Comfortably into the hundreds of thousands. Only the visible slice mounts and everything hot is `O(log n)`, so the row count stops being the bottleneck — your data is.',
];

const HISTORY_THINK: string[] = [
  'Heights derive from text + font + width via a cached canvas layout, so the list has its full scroll height without mounting any rows.',
  'A Fenwick offset index turns one row’s height change into an O(log n) patch; the visible window is a binary search over offsets.',
  'Per-row state lives in the instance, so off-screen rows have exact heights and re-measure on demand without a full re-render.',
  'pretext caches prepare() per (font, string); a resize is arithmetic over the cached metrics, not a re-layout.',
  'useMugenEffect runs for every row on a microtask after measure, so async content settles to an exact height with no shift.',
];

const HISTORY_TOOLS: Tool[][] = [
  [{ kind: 'read', title: 'Read the concepts guide', detail: 'concepts.mdx' }],
  [
    { kind: 'search', title: 'Searched the API', detail: 'useMugenVirtualizer · MugenVList' },
    { kind: 'run', title: 'Profiled a height patch', detail: 'O(log n) · 0.04ms' },
  ],
  [{ kind: 'run', title: 'Benchmarked the scroll', detail: '60fps · 200k rows' }],
  [
    { kind: 'read', title: 'Read the effects guide', detail: 'effects.mdx' },
    { kind: 'web', title: 'Checked measureText()', detail: 'canvas text metrics' },
  ],
  [{ kind: 'search', title: 'Traced setMugenState → re-measure', detail: 'instance.ts' }],
];

const THOUGHT_FOR = ['1.4s', '2.1s', '1.8s', '2.6s', '0.9s', '3.0s'];

function makeHistory(pairs: number): Turn[] {
  const out: Turn[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ id: `h${2 * i}`, role: 'user', body: HISTORY_USER[i % HISTORY_USER.length]! });
    const asst: Turn = {
      id: `h${2 * i + 1}`,
      role: 'assistant',
      body: HISTORY_ASST[i % HISTORY_ASST.length]!,
    };
    // Roughly every third reply shows a reasoning trace + tools, for height variety.
    if (i % 3 === 0) {
      asst.thoughtFor = THOUGHT_FOR[i % THOUGHT_FOR.length];
      asst.thinking = HISTORY_THINK[i % HISTORY_THINK.length];
      asst.tools = HISTORY_TOOLS[i % HISTORY_TOOLS.length];
    }
    out.push(asst);
  }
  return out;
}

// ~2984 generated turns + the 16 curated tail turns ≈ 3,000 messages.
const CONVO: Turn[] = [...makeHistory(1492), ...TAIL];

function AiChatExample(): ReactNode {
  // `runId` re-keys the live turn so Replay restarts its stream from scratch.
  const [runId, setRunId] = useState(0);
  const items = useMemo(
    () => CONVO.map((t) => (t.live ? { ...t, id: `live-${runId}` } : t)),
    [runId],
  );
  const list = useMugenVirtualizer({ items });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex items-center justify-between gap-2 border-b bg-fd-muted/30 px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] text-fd-muted-foreground">
          {CONVO.length.toLocaleString()} messages
          <span className="hidden sm:inline"> · streaming · stick-to-bottom</span>
        </span>
        <button
          type="button"
          onClick={() => setRunId((r) => r + 1)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-fd-background px-2.5 py-1 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground"
        >
          ↻ Replay
        </button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <MugenVList
          instance={list}
          getKey={(t) => t.id}
          render={TurnRow}
          font="15px Inter, sans-serif"
          lineHeight={24}
          maxW={720}
          overscan={320}
          initialScroll="bottom"
          stickToBottom
          className="mu-scroll"
        />
        <ScrollToBottomButton list={list} />
        {import.meta.env.DEV ? <MeasureDebugBadge /> : null}
      </div>
    </div>
  );
}

// TEMP (dev only): live computed-vs-DOM delta for the row window, overlaid on
// the demo so a real device can report measurement drift. Δ = computed height
// minus painted height of the last rendered row; ~0 means heights are exact.
function MeasureDebugBadge(): ReactNode {
  const [text, setText] = useState('Δ …');
  useEffect(() => {
    const id = setInterval(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-mugen-row]')].filter((r) =>
        r.getAttribute('data-mugen-row')!.startsWith('live-'),
      );
      const row = rows[rows.length - 1];
      if (!row) return setText('Δ no live row');
      const spacer = row.parentElement!;
      const top = parseFloat(row.style.top || '0');
      const gap = spacer.getBoundingClientRect().height - top - row.getBoundingClientRect().height;
      setText(`Δ ${gap.toFixed(1)}px`);
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        padding: '4px 8px',
        borderRadius: 8,
        background: 'rgba(220, 38, 38, 0.9)',
        color: '#fff',
        font: '600 11px ui-monospace, monospace',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}

// Floats over the list, shown only while the user has scrolled away from the
// bottom. Visibility is a selector over the instance's scroll state, so it
// re-renders only when that boolean flips — not on every streamed token.
function ScrollToBottomButton({ list }: { list: MugenInstance<Turn> }): ReactNode {
  const awayFromBottom = useMugenSelector(list, (s) => s.distanceFromBottom > 200);
  return (
    <button
      type="button"
      onClick={() => list.scrollToBottom({ behavior: 'smooth' })}
      className="group absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-fd-border/70 bg-fd-background/80 py-1.5 pl-2.5 pr-3.5 text-xs font-medium text-fd-muted-foreground shadow-lg ring-1 ring-black/5 backdrop-blur-md transition-all duration-200 ease-out hover:border-fd-border hover:text-fd-foreground data-[hidden=true]:pointer-events-none data-[hidden=true]:translate-y-2 data-[hidden=true]:opacity-0 dark:ring-white/10"
      data-hidden={!awayFromBottom}
    >
      <span className="flex size-4 items-center justify-center rounded-full bg-fd-primary/10 text-fd-primary transition-transform duration-200 group-hover:translate-y-0.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </span>
      Scroll to bottom
    </button>
  );
}

// ── Real markdown (@wingleeio/mugen-markdown) ────────────────────────────────
//
// incremark parses each note; mugen-markdown renders it with mugen primitives,
// so every row — headings, lists, fenced code, tables, inline bold/code/links —
// is measured analytically by the walker. A typed `components` override (built
// from the same primitives) gives h1 an accent rule, and a small theme aligns
// fonts and the link colour with the docs.

interface Doc {
  id: string;
  md: string;
}

const DOCS: Doc[] = [
  {
    id: '1',
    md: 'Ship it 👍 — the renderer is **done**.',
  },
  {
    id: '2',
    md: `# Measurable markdown

Each block is a **mugen primitive**, so the walker computes this row's height
*before* it mounts — headings, paragraphs with \`inline code\`, and
[links](https://www.incremark.com/) all included.

- parsed with incremark
- rendered with \`VStack\` / \`RichText\`
- measured, never guessed`,
  },
  {
    id: '3',
    md: `## Inline rich text is the hard part

A sentence mixing **bold**, *italic*, and \`code()\` is one wrapping flow of
different fonts. mugen-markdown measures it as a single flow:

\`\`\`ts
const h = lines * lineHeight; // from pretext rich-inline
\`\`\`

> One description feeds both the measure and the render — they can't desync.`,
  },
  {
    id: '4',
    md: `### GFM, too

| feature | status |
|---------|--------|
| tables  | ✓      |
| tasks   | ✓      |

1. off-screen rows have exact heights
2. resizing is pure arithmetic
3. no measure-on-mount shift

---

That's the whole idea.`,
  },
];

const MD_THEME = {
  fontFamily: 'Inter',
  monoFamily: '"Geist Mono Variable", monospace',
  fontSize: 15,
  lineHeight: 24,
  link: { color: 'var(--color-fd-primary)', underline: true },
} as const;

// A typed override: `node` is `Heading`, so `node.depth` is 1..6. Built from
// mugen primitives, it stays measurable.
const mdComponents = defineMarkdownComponents({
  heading: ({ node, children }) =>
    node.depth === 1 ? (
      <VStack gap={6}>
        {children}
        <VStack height={2} style={{ background: 'var(--color-fd-primary)', borderRadius: 2 }} />
      </VStack>
    ) : (
      children
    ),
});

function DocRow(item: Doc): ReactNode {
  return (
    <VStack padding={18}>
      <Markdown source={item.md} theme={MD_THEME} components={mdComponents} />
    </VStack>
  );
}

function MugenMarkdownExample(): ReactNode {
  const list = useMugenVirtualizer({ items: DOCS });
  return (
    <MugenVList
      instance={list}
      getKey={(d) => d.id}
      render={DocRow}
      font="15px Inter, sans-serif"
      lineHeight={24}
      maxW={680}
      className={scrollCls}
    />
  );
}

// ── mugen-ui overlays ─────────────────────────────────────────────────────

interface Member {
  id: string;
  name: string;
  role: string;
  email: string;
  color: string;
  initial: string;
}

const MEMBER_NAMES = [
  'Ada Lovelace',
  'Alan Turing',
  'Grace Hopper',
  'Linus Torvalds',
  'Margaret Hamilton',
  'Donald Knuth',
  'Barbara Liskov',
  'Edsger Dijkstra',
];
const MEMBER_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const MEMBER_ROLES = ['Engineering', 'Design', 'Product', 'Data', 'Research', 'Support', 'Sales', 'Platform'];
const REACTIONS = ['👍', '🎉', '❤️', '🚀', '👀', '🔥'];

function makeMembers(n: number): Member[] {
  const out: Member[] = [];
  for (let i = 0; i < n; i++) {
    const a = i % MEMBER_NAMES.length;
    const name = MEMBER_NAMES[a]!;
    out.push({
      id: String(i),
      name,
      role: MEMBER_ROLES[i % MEMBER_ROLES.length]!,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      color: MEMBER_COLORS[a]!,
      initial: name[0]!,
    });
  }
  return out;
}

// A ghost action button. The declared `height` is authoritative, so the box is
// exactly 32px tall in both the walk and the paint and can never stretch to the
// row height (like the avatar). The visual — fill, hover, radius — lives on this
// measured box itself, so what you see and what you hover are the same 32px box;
// `padding` sets the horizontal breathing room and is counted by the walker.
const ActionBox = definePrimitive('div', { name: 'ActionBox' });

// `: string` so it bypasses the SafeClassName literal check; only visual
// utilities, so measurement is unaffected. Text color is inherited by the inner
// <Text>, so hover recolors the label too.
const actionBtnCls: string =
  'rounded-[9px] text-fd-muted-foreground transition-colors duration-150 ' +
  'hover:bg-fd-accent hover:text-fd-foreground';

function ActionLabel({ label }: { label: string }): ReactNode {
  return (
    <ActionBox height={32} padding={13} align="center" justify="center" className={actionBtnCls}>
      <Text font="500 12.5px Inter, sans-serif" lineHeight={16}>
        {label}
      </Text>
    </ActionBox>
  );
}

// Hover focuses the item (see Dropdown.Item), so a single `focus:` highlight
// covers both mouse and keyboard — no double-highlight on adjacent items.
const menuItemCls =
  'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-fd-foreground ' +
  'transition-colors focus:bg-fd-accent focus:outline-none';

function MemberActions({ m }: { m: Member }): ReactNode {
  return (
    <HStack gap={4} align="center">
      {/* Popover — a reaction bar, dismissed on outside press / Escape */}
      <Popover>
        <Popover.Trigger>
          <ActionLabel label="React" />
        </Popover.Trigger>
        <Popover.Content
          align="end"
          className="flex gap-0.5 rounded-2xl border border-fd-border bg-fd-popover p-1.5 shadow-2xl shadow-black/40"
        >
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded-xl px-2 py-1.5 text-base leading-none transition-transform duration-150 hover:scale-125 hover:bg-fd-accent"
            >
              {e}
            </button>
          ))}
        </Popover.Content>
      </Popover>

      {/* Dialog — a modal card, focus-managed, Escape / backdrop to dismiss */}
      <Dialog>
        <Dialog.Trigger>
          <ActionLabel label="Details" />
        </Dialog.Trigger>
        <Dialog.Content className="w-[340px] rounded-2xl border border-fd-border bg-fd-popover p-5 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 items-center justify-center rounded-[14px] text-base font-semibold text-white"
              style={{
                background: m.color,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              {m.initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{m.name}</div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-fd-muted-foreground">
                {m.role}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-fd-muted-foreground">
            This whole card is portaled out of the row and measured as 0 — so opening it never
            re-flows the 800-row list. Reach{' '}
            <span className="font-medium text-fd-foreground">{m.email}</span>.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-3 py-1.5 text-sm font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground">
              Close
            </Dialog.Close>
            <Dialog.Close className="rounded-lg bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90">
              Message
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog>

      {/* Dropdown — a "more" menu with arrow-key roving focus */}
      <Dropdown>
        <Dropdown.Trigger>
          <ActionBox width={38} height={32} align="center" justify="center" className={actionBtnCls}>
            <Text font="600 16px Inter, sans-serif" lineHeight={16}>
              ⋯
            </Text>
          </ActionBox>
        </Dropdown.Trigger>
        <Dropdown.Content
          align="end"
          className="min-w-[184px] rounded-2xl border border-fd-border bg-fd-popover p-1.5 shadow-2xl shadow-black/40"
        >
          <Dropdown.Item className={menuItemCls}>View profile</Dropdown.Item>
          <Dropdown.Item className={menuItemCls}>Mute notifications</Dropdown.Item>
          <div className="my-1 h-px bg-fd-border" />
          <Dropdown.Item className={menuItemCls + ' text-fd-destructive'}>Remove from team</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown>
    </HStack>
  );
}

/** A measured avatar: 40×40 with a soft top-light + inset ring for depth. */
function Avatar({ m }: { m: Member }): ReactNode {
  return (
    <VStack
      width={40}
      height={40}
      align="center"
      justify="center"
      style={{
        borderRadius: 13,
        background: m.color,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.08), 0 2px 6px -1px rgba(0,0,0,0.45)',
      }}
    >
      <Text font="600 15px Inter, sans-serif" lineHeight={20} color="rgba(255,255,255,0.96)">
        {m.initial}
      </Text>
    </VStack>
  );
}

// `string`-typed so it bypasses the SafeClassName literal check; contains only
// visual utilities (no spacing/sizing), so measurement is unaffected.
const rowCls: string = 'transition-colors duration-150 hover:bg-fd-muted/30';

function MemberRow(m: Member): ReactNode {
  return (
    <HStack gap={14} padding={14} align="center" className={rowCls}>
      <Avatar m={m} />

      {/* The trigger is measured like any primitive; it stays sized to the name,
          so the portaled bubble anchors right beside it. */}
      <Tooltip>
        <Tooltip.Trigger>
          <VStack gap={3}>
            {/* `shrink` measures each line at its natural one-line width — matching
                the fit-content render — so a long name can't wrap in the analytic
                pass and leave the row over-tall. */}
            <Text shrink font="600 14px Inter, sans-serif" lineHeight={18} color="var(--color-fd-foreground)">
              {m.name}
            </Text>
            <Text
              shrink
              font="600 10.5px Inter, sans-serif"
              lineHeight={14}
              letterSpacing={0.6}
              color="var(--color-fd-muted-foreground)"
            >
              {`${m.role.toUpperCase()}   ·   #${m.id}`}
            </Text>
          </VStack>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="bottom"
          align="start"
          className="rounded-xl border border-fd-border bg-fd-popover px-3 py-2 text-xs shadow-2xl shadow-black/40"
        >
          <div className="font-semibold text-fd-foreground">{m.name}</div>
          <div className="mt-0.5 text-fd-muted-foreground">{m.email}</div>
        </Tooltip.Content>
      </Tooltip>

      {/* An empty flex spacer fills the gap, pinning the actions to the right. */}
      <VStack style={{ flex: 1 }} />

      <MemberActions m={m} />
    </HStack>
  );
}

function OverlaysExample(): ReactNode {
  const [items] = useState(() => makeMembers(800));
  const list = useMugenVirtualizer({ items });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      render={MemberRow}
      font="14px Inter, sans-serif"
      lineHeight={20}
      maxW={760}
      className={scrollCls}
    />
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

export interface ExampleEntry {
  preview: () => ReactNode;
  codeHtml: string;
  /** Suggested preview height in px. */
  height: number;
}

export const EXAMPLES: Record<string, ExampleEntry> = {
  'ai-chat': { preview: () => <AiChatExample />, codeHtml: aiChatHtml, height: 560 },
  'bidirectional-pagination': {
    preview: () => <BidirectionalPaginationExample />,
    codeHtml: bidirectionalPaginationHtml,
    height: 440,
  },
  chat: { preview: () => <ChatExample />, codeHtml: chatHtml, height: 280 },
  accordion: { preview: () => <AccordionExample />, codeHtml: accordionHtml, height: 280 },
  markdown: { preview: () => <MarkdownExample />, codeHtml: markdownHtml, height: 320 },
  'mugen-markdown': { preview: () => <MugenMarkdownExample />, codeHtml: mugenMarkdownHtml, height: 420 },
  overlays: { preview: () => <OverlaysExample />, codeHtml: overlaysHtml, height: 460 },
};

export type ExampleId = keyof typeof EXAMPLES;
