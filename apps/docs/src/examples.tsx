import { type ReactNode } from 'react';
import {
  definePrimitive,
  HStack,
  MugenVList,
  Text,
  useMugenEffect,
  useMugenState,
  useMugenVirtualizer,
  VStack,
} from 'mugen';
import { chatHtml, accordionHtml, markdownHtml, aiChatHtml } from './components/highlighted';

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
  /** Body paragraphs (each its own measured <Text>). */
  body: string[];
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
} as const;

const MONO = "'Geist Mono Variable', monospace";

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
      style={{ background: AC.card, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${AC.hairline}` }}
    >
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
      <VStack width={16} align="center" justify="center">
        <Text
          font="600 12px Inter, sans-serif"
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
  return (
    <VStack
      padding={12}
      style={{
        background: AC.card,
        borderRadius: 11,
        // Left accent + hairline as inset shadows so they never change the
        // measured box (a real border would shift wrapping).
        boxShadow: `inset 2px 0 0 0 ${AC.accent}, inset 0 0 0 1px ${AC.hairline}`,
      }}
    >
      <Text font="13.5px Inter, sans-serif" lineHeight={21} color={AC.muted}>
        {text}
      </Text>
    </VStack>
  );
}

function UserTurn({ item }: { item: Turn }): ReactNode {
  return (
    <VStack padding={14} align="flex-end">
      <VStack
        width={430}
        padding={14}
        style={{ background: AC.bubble, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${AC.hairline}` }}
      >
        {item.body.map((p, i) => (
          <Text key={i} font="15px Inter, sans-serif" lineHeight={23} color={AC.fg}>
            {p}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}

function TurnRow(item: Turn): ReactNode {
  const isLive = !!item.live;

  // Reasoning starts open on the "live" turn so you catch it thinking.
  const [open, setOpen] = useMugenState(isLive);
  // The live turn streams its answer in after a beat; others are done already.
  const [streamed, setStreamed] = useMugenState(!isLive);
  useMugenEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setStreamed(true);
    }, 1100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [item.id, isLive]);

  if (item.role === 'user') return <UserTurn item={item} />;

  const working = isLive && !streamed;

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
              <Text
                font={`500 11.5px ${MONO}`}
                lineHeight={16}
                color={AC.muted}
                className={working ? 'mu-pulse' : undefined}
              >
                {working ? 'Thinking…' : `Thought for ${item.thoughtFor ?? '3.0s'}`}
              </Text>
            </HStack>
          </Disclosure>
          {open ? <Reasoning text={item.thinking} /> : null}
        </VStack>
      ) : null}

      {item.tools ? (
        <VStack gap={7}>
          {item.tools.map((t, i) => (
            <ToolCard key={i} tool={t} running={working && i === item.tools!.length - 1} />
          ))}
        </VStack>
      ) : null}

      {working ? (
        <HStack gap={8} align="center">
          <Text font="600 13px Inter, sans-serif" lineHeight={24} color={AC.accent} className="mu-pulse">
            ●
          </Text>
          <Text font="15px Inter, sans-serif" lineHeight={24} color={AC.muted}>
            Writing the answer…
          </Text>
        </HStack>
      ) : (
        item.body.map((p, i) => (
          <Text key={i} font="15px Inter, sans-serif" lineHeight={24} color={AC.fg}>
            {p}
          </Text>
        ))
      )}
    </VStack>
  );
}

// A long, believable session so the list actually scrolls.
const CONVO: Turn[] = [
  {
    id: '1',
    role: 'user',
    body: ['I need an inbox that scrolls 50,000 emails without jank, and some rows expand inline. Where do I start?'],
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
    body: [
      'Start with one virtualizer over your data — useMugenVirtualizer({ items: emails }) — then render rows through MugenVList.',
      'Because heights are computed (not measured on mount), the list knows its full scroll height up front. 50k rows scroll as smoothly as five.',
    ],
  },
  {
    id: '3',
    role: 'user',
    body: ['Some rows open a reply box when clicked. Won’t expanding a row above the viewport shove everything and lose my scroll position?'],
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
    body: [
      'No — keep the open/closed flag in useMugenState. Toggling re-measures just that row and patches the offset index, so nothing above the fold jumps.',
      'Try it right here: open a “Thought for…” trace above and watch the list re-flow without losing your place.',
    ],
  },
  {
    id: '5',
    role: 'user',
    body: ['How can the heights be exact if you never touch the DOM?'],
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
    body: [
      'One description feeds both the measurement walk and the React render, so they can’t disagree by a pixel — the height you compute is the height that paints.',
    ],
  },
  {
    id: '7',
    role: 'user',
    body: ['Rows have avatars on the left and a growing text column on the right. How do I lay that out?'],
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
    body: [
      'Put the avatar in a width/height box and let the text VStack take the remainder: <HStack gap={12}><VStack width={36} height={36}/><VStack>…</VStack></HStack>.',
      'Every row can be a different height and they all measure correctly — the column width drives the text wrap, which drives the height.',
    ],
  },
  {
    id: '9',
    role: 'user',
    body: ['Each email body is markdown that I parse asynchronously. Can a row resize after it loads?'],
  },
  {
    id: '10',
    role: 'assistant',
    thoughtFor: '2.6s',
    thinking:
      'useMugenEffect runs for every row, on- or off-screen, on a microtask after measure. Parse there, store the blocks with useMugenState, and the row re-measures to its exact height when the result lands — no layout shift.',
    tools: [
      { kind: 'read', title: 'Read the effects guide', detail: 'effects.mdx' },
      { kind: 'run', title: 'Simulated an async parse', detail: 'row re-measured · 0 layout shift' },
    ],
    body: [
      'Yes. Do the work in useMugenEffect, setMugenState with the parsed blocks, and mugen re-measures the affected rows for you. It works for off-screen rows too, so the scroll height is right before you ever get there.',
    ],
  },
  {
    id: '11',
    role: 'user',
    body: ['What fonts can I use, and does the measurement track them?'],
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
    body: [
      'Any real family with a size: font="600 15px Inter". When a webfont finishes loading, mugen bumps a font epoch and re-measures the rows that used it — so the layout settles to the exact metrics.',
    ],
  },
  {
    id: '13',
    role: 'user',
    body: ['Does it hold up at a million rows, or is 50k the ceiling?'],
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
    body: [
      'It holds. The cost is logarithmic in row count and only the visible slice mounts, so a million rows scroll like a thousand — your data size is the real ceiling.',
    ],
  },
  {
    id: '15',
    role: 'user',
    body: ['Last thing: can I deep-link to message #41,212 and have it land centered on the first try?'],
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
    body: [
      'Yes: list.scrollToItem("41212", { align: "center", behavior: "smooth" }). The offset is already known, so it lands centered on the first try — no jump, no correction pass.',
    ],
  },
];

function AiChatExample(): ReactNode {
  const list = useMugenVirtualizer({ items: CONVO });
  return (
    <MugenVList
      instance={list}
      getKey={(t) => t.id}
      render={TurnRow}
      font="15px Inter, sans-serif"
      lineHeight={24}
      maxW={720}
      overscan={320}
      className="mu-scroll"
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
};

export type ExampleId = keyof typeof EXAMPLES;
