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
import { chatHtml, accordionHtml, markdownHtml } from './components/highlighted';

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

// ── Registry ────────────────────────────────────────────────────────────────

export interface ExampleEntry {
  preview: () => ReactNode;
  codeHtml: string;
  /** Suggested preview height in px. */
  height: number;
}

export const EXAMPLES: Record<string, ExampleEntry> = {
  chat: { preview: () => <ChatExample />, codeHtml: chatHtml, height: 280 },
  accordion: { preview: () => <AccordionExample />, codeHtml: accordionHtml, height: 280 },
  markdown: { preview: () => <MarkdownExample />, codeHtml: markdownHtml, height: 320 },
};

export type ExampleId = keyof typeof EXAMPLES;
