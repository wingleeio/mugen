import { useMemo, useState, type ReactNode } from 'react';
import {
  definePrimitive,
  HStack,
  MugenVList,
  type MugenInstance,
  Text,
  useMugenEffect,
  useMugenSelector,
  useMugenState,
  useMugenVirtualizer,
  VStack,
} from '@wingleeio/mugen';
import { Markdown, defineMarkdownComponents } from '@wingleeio/mugen-markdown';
import { chatHtml, accordionHtml, markdownHtml, mugenMarkdownHtml, aiChatHtml } from './components/highlighted';

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

function Mark(): ReactNode {
  return (
    <VStack
      width={22}
      height={22}
      align="center"
      justify="center"
      style={{
        background: `linear-gradient(140deg, ${AC.fg}, color-mix(in oklab, ${AC.fg} 50%, ${AC.accent}))`,
        borderRadius: 7,
      }}
    >
      <Text font="600 12px Inter, sans-serif" lineHeight={14} color={AC.page}>
        ✦
      </Text>
    </VStack>
  );
}

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

  return (
    <VStack gap={12} padding={20}>
      <HStack gap={9} align="center">
        <Mark />
        <Text font={`500 11px ${MONO}`} lineHeight={14} letterSpacing={0.6} color={AC.muted}>
          mugen
        </Text>
      </HStack>

      {item.thinking ? (
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
      ) : null}

      {item.tools ? (
        <VStack gap={7}>
          {item.tools.map((t, i) => (
            <ToolCard key={i} tool={t} running={streaming && i === item.tools!.length - 1} />
          ))}
        </VStack>
      ) : null}

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
      </div>
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

// ── Registry ────────────────────────────────────────────────────────────────

export interface ExampleEntry {
  preview: () => ReactNode;
  codeHtml: string;
  /** Suggested preview height in px. */
  height: number;
}

export const EXAMPLES: Record<string, ExampleEntry> = {
  'ai-chat': { preview: () => <AiChatExample />, codeHtml: aiChatHtml, height: 560 },
  chat: { preview: () => <ChatExample />, codeHtml: chatHtml, height: 280 },
  accordion: { preview: () => <AccordionExample />, codeHtml: accordionHtml, height: 280 },
  markdown: { preview: () => <MarkdownExample />, codeHtml: markdownHtml, height: 320 },
  'mugen-markdown': { preview: () => <MugenMarkdownExample />, codeHtml: mugenMarkdownHtml, height: 420 },
};

export type ExampleId = keyof typeof EXAMPLES;
