// Pre-highlights the landing-page code snippets with Shiki at author time, so
// the app bundle ships zero Shiki/WASM. Re-run after editing a snippet:
//   node scripts/gen-highlight.mjs
import { codeToHtml } from 'shiki';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SNIPPETS = {
  contractHtml: `import { MugenVList, Text, VStack, useMugenVirtualizer } from '@wingleeio/mugen';

function Inbox({ messages }: { messages: Message[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      font="16px Inter"
      lineHeight={22}
      maxW="3xl"
      render={(m) => (
        <VStack gap={2} padding={12}>
          <Text font="600 15px Inter">{m.author}</Text>
          <Text>{m.text}</Text>
        </VStack>
      )}
    />
  );
}`,
  demoSourceHtml: `import {
  MugenVList, Text, VStack, HStack,
  definePrimitive, useMugenState, useMugenVirtualizer,
} from '@wingleeio/mugen';

interface Msg { id: string; author: string; color: string; body: string }

const RowButton = definePrimitive('button');

// A row is a tree of primitives + the mugen hooks. No reducers, no actions.
function Row(m: Msg) {
  const [expanded, setExpanded] = useMugenState(false);
  return (
    <RowButton padding={14} onClick={() => setExpanded((e) => !e)}>
      <HStack gap={14}>
        <VStack width={34} height={34} style={{ background: m.color }} />
        <VStack gap={4}>
          <Text font="600 14px Inter">{m.author}</Text>
          <Text>{m.body}</Text>
          {expanded ? <Text>Re-measured this one row — no DOM.</Text> : null}
        </VStack>
      </HStack>
    </RowButton>
  );
}

function Chat({ messages }: { messages: Msg[] }) {
  const list = useMugenVirtualizer({ items: messages });
  // list.scrollToItem('1900', { behavior: 'smooth', align: 'center' })
  return (
    <MugenVList
      instance={list} getKey={(m) => m.id} render={Row}
      font="15px Inter" lineHeight={23} maxW={720} height={452}
    />
  );
}`,

  chatHtml: `import { MugenVList, Text, VStack, HStack, useMugenVirtualizer } from '@wingleeio/mugen';

interface Msg { id: string; author: string; color: string; text: string }

function Row(m: Msg) {
  return (
    <HStack gap={10} padding={11}>
      <VStack width={28} height={28} style={{ borderRadius: 8, background: m.color }} />
      <VStack gap={2}>
        <Text font="600 13px Inter">{m.author}</Text>
        <Text>{m.text}</Text>
      </VStack>
    </HStack>
  );
}

function Chat({ messages }: { messages: Msg[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList instance={list} getKey={(m) => m.id} render={Row}
      font="14px Inter" lineHeight={21} maxW={520} />
  );
}`,

  accordionHtml: `import {
  MugenVList, Text, VStack, definePrimitive,
  useMugenState, useMugenVirtualizer,
} from '@wingleeio/mugen';

interface Faq { id: string; q: string; a: string }

const Row = definePrimitive('button');

function FaqRow(item: Faq) {
  const [open, setOpen] = useMugenState(false);
  return (
    <Row padding={13} onClick={() => setOpen((o) => !o)}>
      <VStack gap={6}>
        <Text font="600 14px Inter">{open ? '−' : '+'}  {item.q}</Text>
        {open ? <Text>{item.a}</Text> : null}
      </VStack>
    </Row>
  );
}

function Faqs({ items }: { items: Faq[] }) {
  const list = useMugenVirtualizer({ items });
  return (
    <MugenVList instance={list} getKey={(f) => f.id} render={FaqRow}
      font="14px Inter" lineHeight={21} maxW={560} />
  );
}`,

  bidirectionalPaginationHtml: `import { useMemo, useState } from 'react';
import { HStack, MugenVList, Text, VStack, useMugenVirtualizer } from '@wingleeio/mugen';

interface Event { id: string; n: number; title: string; meta: string; body?: string; note?: string }

function page(start: number, end: number): Event[] {
  return Array.from({ length: end - start + 1 }, (_, i) => fetchEvent(start + i));
}

// A full-bleed hairline between rows — a measured 1px line, not a CSS border
// (the walker can't see borders), so rows and skeletons separate the same way.
const Divider = () => <VStack height={1} style={{ background: 'var(--line)' }} />;

// A shimmering placeholder bar — the box is owned by props (so it measures
// exactly); '.mu-skeleton' adds the decorative sweep.
function Bar({ w, h }: { w?: number; h: number }) {
  return <VStack {...(w ? { width: w } : null)} height={h} className="mu-skeleton" style={{ borderRadius: 6 }} />;
}

// A body line. Width renders as 'flex: 0 0 w' on the main axis, so a partial
// line must sit in an HStack (horizontal) — in a column it would pin the height.
const Line = ({ w }: { w?: number }) =>
  w == null ? <Bar h={9} /> : <HStack><Bar w={w} h={9} /></HStack>;

function Skeleton() {
  return (
    <VStack>
      <VStack gap={11} padding={16}>
        <HStack gap={12} align="center" justify="space-between">
          <Bar w={180} h={12} />
          <Bar w={30} h={10} />
        </HStack>
        <HStack gap={9} align="center">
          <Bar w={8} h={8} />
          <Bar w={156} h={9} />
        </HStack>
        <VStack gap={9}>
          <Line />
          <Line />
          <Line w={240} />
        </VStack>
      </VStack>
      <Divider />
    </VStack>
  );
}

// The slot is measured like a row, so it can hold skeletons while a page loads,
// a soft hint when idle, or an end-cap once a direction is exhausted.
function Slot({ edge, loading, done }: { edge: 'top' | 'bottom'; loading: boolean; done: boolean }) {
  if (loading) return <VStack><Skeleton /><Skeleton /></VStack>;
  const top = edge === 'top';
  return (
    <VStack padding={14} align="center">
      <Text font="500 11px 'Geist Mono Variable'" color="var(--faint)">
        {done
          ? top ? 'BEGINNING OF HISTORY' : 'YOU’RE ALL CAUGHT UP'
          : top ? '↑  Scroll up for older events' : '↓  Scroll down for newer events'}
      </Text>
    </VStack>
  );
}

function Row(event: Event) {
  return (
    <VStack>
      <VStack gap={9} padding={16}>
        <HStack gap={12} align="flex-start" justify="space-between">
          <Text font="600 14px Inter">{event.title}</Text>
          <VStack width={46} align="flex-end">
            <Text font="500 11px 'Geist Mono Variable'" color="var(--faint)">{\`#\${event.n}\`}</Text>
          </VStack>
        </HStack>
        <Text font="500 11px 'Geist Mono Variable'" color="var(--muted)">{event.meta}</Text>
        {event.body ? <Text color="var(--muted)">{event.body}</Text> : null}
        {event.note ? (
          <HStack gap={11} align="stretch">
            <VStack width={2} style={{ borderRadius: 2, background: 'var(--rail)' }} />
            <Text font="500 12.5px Inter" color="var(--muted)">{event.note}</Text>
          </HStack>
        ) : null}
      </VStack>
      <Divider />
    </VStack>
  );
}

function AuditTrail() {
  const [range, setRange] = useState({ start: 480, end: 511 });
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingBottom, setLoadingBottom] = useState(false);
  const items = useMemo(() => page(range.start, range.end), [range]);
  const list = useMugenVirtualizer({ items });

  const loadOlder = () => {
    if (loadingTop || range.start === 0) return;
    setLoadingTop(true);
    fetchPage().then(() => {
      setRange((r) => ({ ...r, start: Math.max(0, r.start - 12) }));
      setLoadingTop(false);
    });
  };

  const loadNewer = () => {
    if (loadingBottom || range.end === 959) return;
    setLoadingBottom(true);
    fetchPage().then(() => {
      setRange((r) => ({ ...r, end: Math.min(959, r.end + 12) }));
      setLoadingBottom(false);
    });
  };

  return (
    <MugenVList
      instance={list}
      getKey={(event) => event.id}
      render={Row}
      renderTop={() => <Slot edge="top" loading={loadingTop} done={range.start === 0} />}
      renderBottom={() => <Slot edge="bottom" loading={loadingBottom} done={range.end === 959} />}
      onTopReached={loadOlder}
      onBottomReached={loadNewer}
      topReachedThreshold={24}
      bottomReachedThreshold={24}
      initialScroll={{ to: 'index', index: 10, align: 'center' }}
      font="13.5px Inter"
      lineHeight={20}
    />
  );
}`,

  markdownHtml: `import {
  MugenVList, Text, VStack,
  useMugenEffect, useMugenState, useMugenVirtualizer,
} from '@wingleeio/mugen';

interface Note { id: string; md: string }

function NoteRow(item: Note) {
  const [blocks, setBlocks] = useMugenState<string[] | null>(null);

  // Runs for every row — on- or off-screen — and re-measures when it resolves.
  useMugenEffect(() => {
    let cancelled = false;
    parseMarkdown(item.md).then((b) => {
      if (!cancelled) setBlocks(b);
    });
    return () => { cancelled = true; };
  }, [item.md]);

  if (blocks === null)
    return <VStack padding={13}><Text>parsing…</Text></VStack>;
  return (
    <VStack gap={8} padding={13}>
      {blocks.map((b, i) => <Text key={i}>{b}</Text>)}
    </VStack>
  );
}

function Notes({ items }: { items: Note[] }) {
  const list = useMugenVirtualizer({ items });
  return (
    <MugenVList instance={list} getKey={(n) => n.id} render={NoteRow}
      font="14px Inter" lineHeight={22} maxW={560} />
  );
}`,

  aiChatHtml: `import {
  MugenVList, Text, VStack, definePrimitive,
  useMugenState, useMugenEffect, useMugenVirtualizer,
} from '@wingleeio/mugen';
import { Markdown } from '@wingleeio/mugen-markdown';

interface Tool { kind: 'search' | 'read' | 'run' | 'web'; title: string; detail?: string }
interface Turn {
  id: string;
  role: 'user' | 'assistant';
  body: string;        // markdown
  thinking?: string;   // collapsed reasoning trace
  tools?: Tool[];      // tool-use cards
  live?: boolean;      // streams its answer in
}

const Disclosure = definePrimitive('button');
const theme = { fontFamily: 'Inter', monoFamily: 'Geist Mono Variable', fontSize: 15, lineHeight: 24 };

// A turn is a pure item -> tree. The three mugen hooks do the rest; the body is
// markdown, rendered with mugen primitives so the walker measures every block.
function TurnRow(item: Turn) {
  // Collapse / expand the reasoning — re-measures just this row, O(log n).
  const [open, setOpen] = useMugenState(!!item.live);

  // The live turn streams its answer in, word by word. The growing markdown
  // prefix is parsed incrementally (append-only) by <Markdown>.
  const words = item.body.split(' ');
  const [shown, setShown] = useMugenState(item.live ? 0 : words.length);
  useMugenEffect(() => {
    if (!item.live) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= words.length) clearInterval(id);
    }, 75);
    return () => clearInterval(id);
  }, [item.id]);

  if (item.role === 'user') return <UserBubble item={item} />;
  const streaming = item.live && shown < words.length;
  const source = item.live ? words.slice(0, shown).join(' ') : item.body;

  return (
    <VStack gap={12} padding={20}>
      {item.thinking ? (
        <VStack gap={open ? 9 : 0}>
          <Disclosure onClick={() => setOpen((o) => !o)}>
            <Text font="500 11.5px 'Geist Mono Variable'" color="gray">
              {open ? '▾ Thought for 2.7s' : '▸ Thought for 2.7s'}
            </Text>
          </Disclosure>
          {open ? <Reasoning text={item.thinking} /> : null}
        </VStack>
      ) : null}

      {item.tools?.map((t, i) => (
        <ToolCard key={i} tool={t} running={streaming && i === item.tools!.length - 1} />
      ))}

      <VStack gap={4}>
        <Markdown source={source} theme={theme} />
        {streaming ? <Text color="gray" className="mu-pulse">▍</Text> : null}
      </VStack>
    </VStack>
  );
}

// Opens at the latest turn and follows the stream down — scroll up to break free.
function Chat({ turns }: { turns: Turn[] }) {
  const list = useMugenVirtualizer({ items: turns });
  return (
    <MugenVList
      instance={list} getKey={(t) => t.id} render={TurnRow}
      font="15px Inter" lineHeight={24} maxW={720}
      initialScroll="bottom" stickToBottom
    />
  );
}`,

  mugenMarkdownHtml: `import { MugenVList, VStack, useMugenVirtualizer } from '@wingleeio/mugen';
import { Markdown, defineMarkdownComponents } from '@wingleeio/mugen-markdown';

interface Doc { id: string; md: string }

// Inline marks are styled via the theme; block nodes via typed components.
const theme = { fontFamily: 'Inter', monoFamily: 'Geist Mono Variable', fontSize: 15, lineHeight: 24 };

// A typed override: node is Heading, so node.depth is 1..6. Built from mugen
// primitives, so it stays measurable by the walker.
const components = defineMarkdownComponents({
  heading: ({ node, children }) =>
    node.depth === 1 ? (
      <VStack gap={6}>
        {children}
        <VStack height={2} style={{ background: 'var(--accent)' }} />
      </VStack>
    ) : (
      children
    ),
});

function DocRow(d: Doc) {
  return (
    <VStack padding={18}>
      <Markdown source={d.md} theme={theme} components={components} />
    </VStack>
  );
}

function Notes({ docs }: { docs: Doc[] }) {
  const list = useMugenVirtualizer({ items: docs });
  // Every row — headings, lists, fenced code, tables, inline bold/code/links —
  // is measured analytically: off-screen rows have exact heights, no shift.
  return <MugenVList instance={list} getKey={(d) => d.id} render={DocRow} maxW={680} />;
}`,

  overlaysHtml: `import { MugenVList, Text, VStack, HStack, useMugenVirtualizer } from '@wingleeio/mugen';
import { Tooltip, Dropdown } from '@wingleeio/mugen-ui';

// A row's trigger is measured like any primitive — it occupies real row space.
// The popover / menu lives in a Portal: measured as 0 and never walked, so it
// can be arbitrary React and never re-flows the 800-row list when it opens.
function Member(m: Member) {
  return (
    <HStack gap={12} padding={12} align="center">
      <VStack width={36} height={36} style={{ background: m.color }} />

      <Tooltip>
        <Tooltip.Trigger>
          {/* measured: contributes the row's height */}
          <VStack gap={2}>
            <Text font="600 13px Inter">{m.name}</Text>
            <Text>{m.role}</Text>
          </VStack>
        </Tooltip.Trigger>
        <Tooltip.Content className="tooltip">
          {/* portaled: any React, measured as 0 */}
          {m.email}
        </Tooltip.Content>
      </Tooltip>

      <Dropdown>
        <Dropdown.Trigger><Text>Actions</Text></Dropdown.Trigger>
        <Dropdown.Content className="menu">
          <Dropdown.Item onSelect={() => view(m)}>View profile</Dropdown.Item>
          <Dropdown.Item onSelect={() => remove(m)}>Remove</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown>
    </HStack>
  );
}

function Members({ members }: { members: Member[] }) {
  const list = useMugenVirtualizer({ items: members });
  return (
    <MugenVList
      instance={list} getKey={(m) => m.id} render={Member}
      font="14px Inter" lineHeight={20} maxW={760}
    />
  );
}`,
};

const entries = await Promise.all(
  Object.entries(SNIPPETS).map(async ([name, code]) => {
    const html = await codeToHtml(code, {
      lang: 'tsx',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
    return `export const ${name} = ${JSON.stringify(html)};`;
  }),
);

const out = `// AUTO-GENERATED by scripts/gen-highlight.mjs — do not edit by hand.\n${entries.join('\n\n')}\n`;
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'highlighted.ts');
writeFileSync(target, out);
console.log('wrote', target);
