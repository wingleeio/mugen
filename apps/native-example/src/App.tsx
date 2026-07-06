/**
 * mugen on React Native — a streaming AI-chat demo.
 *
 * Everything on screen is height-computed, never host-measured: the rows are
 * mugen primitives (and markdown), heights come from pretext-native's font
 * tables, and the list sticks to the bottom with the shared spring while the
 * assistant "streams" markdown in.
 */
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text as RNText, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  MugenVList,
  useMugenVirtualizer,
  useMugenSelector,
  Text,
  VStack,
  HStack,
  Escape,
} from '@wingleeio/mugen-native';
import { Markdown } from '@wingleeio/mugen-markdown-native';
import { FONT_MODULES, setupMeasurement } from './setup-fonts';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const DEMO_MARKDOWN = `## Analytic heights, no DOM

mugen computes every row's height **arithmetically** — from the text, the font
tables, and the column width. This markdown block was *never measured*: its
height was known before it mounted.

- Incremental parsing (incremark)
- Exact heights for \`off-screen\` rows
- Stick-to-bottom that springs, not snaps

\`\`\`ts
const list = useMugenVirtualizer({ items });
// heights: O(log n) — a Fenwick tree, not a layout pass
list.scrollToItem('41212', { align: 'center' });
\`\`\`

| engine | measure | paint |
| --- | --- | --- |
| web | pretext | browser |
| native | pretext-native | materialized lines |
`;

const STREAM_CHUNKS = DEMO_MARKDOWN.match(/[\s\S]{1,24}/g) ?? [];

const seed: Msg[] = [
  { id: 'u1', role: 'user', text: 'How does mugen work on React Native?' },
  { id: 'a1', role: 'assistant', text: DEMO_MARKDOWN },
  { id: 'u2', role: 'user', text: 'Stream me another one.' },
];

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <VStack padding={6} align="flex-end">
        <VStack
          padding={12}
          style={{ backgroundColor: '#2d2547', borderRadius: 16 }}
        >
          <Text shrink color="#efeaff" font="15px Inter" lineHeight={22}>
            {msg.text}
          </Text>
        </VStack>
      </VStack>
    );
  }
  return (
    <VStack padding={6}>
      <HStack gap={8}>
        <Escape height={28} width={28}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#7c6bd6',
            }}
          />
        </Escape>
        <VStack gap={4}>
          <Text font="600 13px Inter" lineHeight={18} color="#a99ee0">
            assistant
          </Text>
          <Markdown source={msg.text} fade />
        </VStack>
      </HStack>
    </VStack>
  );
}

function Chat() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [streaming, setStreaming] = useState(false);
  const list = useMugenVirtualizer({ items: messages });
  const nearBottom = useMugenSelector(list, (s) => s.distanceFromBottom <= 80);

  // Fake a token stream into a fresh assistant message.
  useEffect(() => {
    if (!streaming) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const text = STREAM_CHUNKS.slice(0, i).join('');
      setMessages((prev) => {
        const next = prev.slice(0, -1);
        return [...next, { id: 'stream', role: 'assistant', text }];
      });
      if (i >= STREAM_CHUNKS.length) {
        clearInterval(id);
        setStreaming(false);
      }
    }, 50);
    return () => clearInterval(id);
  }, [streaming]);

  const startStream = () => {
    if (streaming) return;
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== 'stream'),
      { id: 'stream', role: 'assistant', text: '' },
    ]);
    setStreaming(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <MugenVList
        instance={list}
        getKey={(m) => m.id}
        render={(m) => <Bubble msg={m} />}
        font="15px Inter"
        lineHeight={22}
        initialScroll="bottom"
        stickToBottom
        maxW={720}
      />
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: '#25203a',
        }}
      >
        <Pressable
          onPress={startStream}
          style={{
            backgroundColor: streaming ? '#3a3357' : '#7c6bd6',
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 12,
          }}
        >
          <RNText style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>
            {streaming ? 'streaming…' : 'stream markdown'}
          </RNText>
        </Pressable>
        {!nearBottom && (
          <Pressable
            onPress={() => list.scrollToBottom({ behavior: 'smooth' })}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#3a3357',
            }}
          >
            <RNText style={{ color: '#a99ee0', fontFamily: 'Inter_400Regular' }}>
              ↓ bottom
            </RNText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function App() {
  const [paintReady] = useFonts(FONT_MODULES);
  const [measureReady, setMeasureReady] = useState(false);

  useEffect(() => {
    setupMeasurement().then(() => setMeasureReady(true));
  }, []);

  const ready = paintReady && measureReady;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#161221' }}>
      <StatusBar style="light" />
      {ready ? (
        <Chat />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <RNText style={{ color: '#a99ee0' }}>loading fonts…</RNText>
        </View>
      )}
    </SafeAreaView>
  );
}
