import { useState, type ReactNode } from 'react';
import {
  definePrimitive,
  HStack,
  MugenVList,
  Text,
  useMugenState,
  useMugenVirtualizer,
  VStack,
} from '@wingleeio/mugen';
import { demoSourceHtml } from './highlighted';

interface Msg {
  id: string;
  author: string;
  initial: string;
  color: string;
  body: string;
}

const AUTHORS = [
  'Ada Lovelace',
  'Alan Turing',
  'Grace Hopper',
  'Linus Torvalds',
  'Margaret Hamilton',
  'Donald Knuth',
  'Barbara Liskov',
  'Edsger Dijkstra',
];

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// Deliberately wildly different lengths — one emoji to several paragraphs — so
// every row is a different height. This is the case conventional virtualizers
// struggle with; mugen computes each height analytically.
const BODIES = [
  '👍',
  'Shipping it.',
  'Heights come from pretext — text, font, and width. No measure-on-mount pass, so nothing jumps when the list paints.',
  'ok',
  'Click any row to expand it. The row re-measures arithmetically and the scrollbar resizes — even for rows you never scrolled to.',
  'The whole premise: one description of a row feeds both the measurement and the render, so they can never disagree by a pixel. The walker interprets a tree of primitives to derive a height with no mount and no reflow, then React renders that exact same tree to the DOM for the rows inside the viewport. Off-screen rows keep their state in the list instance, so their heights are exact the instant you ask — no scrolling required.',
  'Fenwick tree → O(log n) per update.',
  'pretext does the expensive canvas work once per string and caches it; resizing the list is pure arithmetic over the cached widths. That is the entire performance story, and it scales to a hundred thousand rows.',
  'nice 🎉',
  "Hit “Jump to #1,900”. The scroll lands pixel-exact because every off-screen height is already known — a measure-on-mount virtualizer can't do that; it has to mount a row to learn how tall it is.",
  'A row is a tree of primitives — Text, VStack, HStack, or your own definePrimitive("button"). Each one knows how to measure itself, so the walker never touches the DOM.',
  'The font pretext measures with is the font the CSS paints with, so analytic heights can never drift from what you see. Spacing/sizing utilities are a type error for the same reason.',
  'word-break, letter-spacing, CJK, RTL, emoji — pretext handles them all, because it measures against the browser’s own font engine instead of guessing. The accuracy gate in CI asserts every computed height lands within ~1px of getBoundingClientRect across a multilingual corpus.',
  '👌',
];

const DETAIL =
  'Expanded — the height changed, so mugen re-walked this single row, patched the Fenwick index, and re-anchored the scroll. No DOM measurement.';

function makeMessages(n: number): Msg[] {
  const out: Msg[] = [];
  for (let i = 0; i < n; i++) {
    const a = i % AUTHORS.length;
    out.push({
      id: String(i),
      author: AUTHORS[a]!,
      initial: AUTHORS[a]![0]!,
      color: COLORS[a]!,
      body: `${BODIES[i % BODIES.length]} ·#${i}`,
    });
  }
  return out;
}

const FONT = '15px Inter, sans-serif';

/** A full-width clickable row, backed by a real <button>. */
const RowButton = definePrimitive('button', { name: 'RowButton' });

function renderRow(m: Msg): ReactNode {
  const [expanded, setExpanded] = useMugenState(false);
  return (
    <RowButton
      padding={14}
      onClick={() => setExpanded((e) => !e)}
      style={{
        cursor: 'pointer',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <HStack gap={14}>
        <VStack
          width={34}
          height={34}
          align="center"
          justify="center"
          style={{
            borderRadius: 10,
            background: m.color,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
          }}
        >
          <Text font="600 14px Inter, sans-serif" lineHeight={20} color="white">
            {m.initial}
          </Text>
        </VStack>
        <VStack gap={4}>
          <Text font="600 14px Inter, sans-serif" lineHeight={20}>
            {m.author}
          </Text>
          <Text color="var(--color-fd-muted-foreground)">{m.body}</Text>
          {expanded ? (
            <Text font="13px Inter, sans-serif" lineHeight={20} color="var(--color-fd-primary)">
              {DETAIL}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </RowButton>
  );
}

function DemoList() {
  const [items] = useState(() => makeMessages(2000));
  const list = useMugenVirtualizer({ items });
  const jump = (i: number) =>
    list.scrollToItem(String(i), { behavior: 'smooth', align: 'center' });
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-4 py-2.5 font-mono text-[11px] text-fd-muted-foreground">
        <span className="tabular-nums text-fd-foreground">{items.length.toLocaleString()}</span>
        <span>rows · click one to expand</span>
        <div className="ml-auto flex shrink-0 gap-1">
          <JumpButton onClick={() => jump(0)}>Top</JumpButton>
          <JumpButton onClick={() => jump(500)}>#500</JumpButton>
          <JumpButton onClick={() => jump(1900)}>#1,900</JumpButton>
        </div>
      </div>
      <MugenVList
        instance={list}
        getKey={(m) => m.id}
        render={renderRow}
        font={FONT}
        lineHeight={23}
        maxW={720}
        height={452}
        overscan={240}
        className="mu-scroll flex-1 [&>div>div>div]:border-b [&>div>div>div]:border-fd-border/50"
      />
    </div>
  );
}

function JumpButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2 py-1 font-sans text-[11px] font-medium transition-colors hover:bg-fd-accent"
    >
      {children}
    </button>
  );
}

type Tab = 'preview' | 'code';

export function DemoShowcase() {
  const [tab, setTab] = useState<Tab>('preview');
  return (
    <div className="overflow-hidden rounded-xl border bg-fd-card shadow-[0_1px_0_0_var(--color-fd-border),0_24px_48px_-24px_rgba(0,0,0,0.25)]">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b bg-fd-muted/40 px-3.5 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-fd-border" />
          <span className="size-3 rounded-full bg-fd-border" />
          <span className="size-3 rounded-full bg-fd-border" />
        </div>
        <span className="font-mono text-xs text-fd-muted-foreground">chat-list.tsx</span>
        <div className="ml-auto inline-flex rounded-lg border bg-fd-background p-0.5 font-mono text-xs">
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
            Preview
          </TabButton>
          <TabButton active={tab === 'code'} onClick={() => setTab('code')}>
            Code
          </TabButton>
        </div>
      </div>

      <div className="h-[500px]">
        {tab === 'preview' ? (
          <DemoList />
        ) : (
          <div
            className="mu-code mu-scroll h-full overflow-auto text-[12.5px] [&>.shiki]:min-h-full"
            dangerouslySetInnerHTML={{ __html: demoSourceHtml }}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md px-2.5 py-1 font-medium transition-colors ' +
        (active ? 'bg-fd-primary text-fd-primary-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground')
      }
    >
      {children}
    </button>
  );
}
