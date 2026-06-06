// Pre-highlights the landing-page code snippets with Shiki at author time, so
// the app bundle ships zero Shiki/WASM. Re-run after editing a snippet:
//   node scripts/gen-highlight.mjs
import { codeToHtml } from 'shiki';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SNIPPETS = {
  contractHtml: `import { MugenVList, Text, VStack, useMugenVirtualizer } from 'mugen';

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
} from 'mugen';

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

  chatHtml: `import { MugenVList, Text, VStack, HStack, useMugenVirtualizer } from 'mugen';

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
} from 'mugen';

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

  markdownHtml: `import {
  MugenVList, Text, VStack,
  useMugenEffect, useMugenState, useMugenVirtualizer,
} from 'mugen';

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
  MugenVList, Text, VStack, HStack, definePrimitive,
  useMugenState, useMugenEffect, useMugenVirtualizer,
} from 'mugen';

interface Tool { kind: 'search' | 'read' | 'run' | 'web'; title: string; detail?: string }
interface Turn {
  id: string;
  role: 'user' | 'assistant';
  body: string[];
  thinking?: string;   // collapsed reasoning trace
  tools?: Tool[];      // tool-use cards
  live?: boolean;      // streams its answer in
}

const Disclosure = definePrimitive('button');

// A turn is a pure item -> tree. The three mugen hooks do the rest.
function TurnRow(item: Turn) {
  // Collapse / expand the reasoning — re-measures just this row, O(log n).
  const [open, setOpen] = useMugenState(!!item.live);

  // The live turn streams its answer in, word by word.
  const words = item.body.join(' ').split(' ');
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

      {item.live
        ? <Text>{words.slice(0, shown).join(' ') + (streaming ? ' ▍' : '')}</Text>
        : item.body.map((p, i) => <Text key={i}>{p}</Text>)}
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
