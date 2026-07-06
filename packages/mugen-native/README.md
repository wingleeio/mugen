# mugen-native

[mugen](../mugen) for **React Native**: virtualized lists whose row heights are
**computed** from font tables — via
[`@wingleeio/pretext-native`](../pretext-native) — never measured from the host.
Exact heights for never-mounted rows, zero measure-on-mount shift, pixel-exact
deep links, O(log n) offsets: the web guarantees, on Hermes.

It is a *renderer*, not a fork: the engine (walker, Fenwick offset index, row
slots, stick-to-bottom spring, animation clock) is imported from
`@wingleeio/mugen/native-core`, and every primitive's measure half is the web
implementation — heights cannot drift between platforms. What's native:

- **`MugenVList`** drives a `ScrollView` through a scroll adapter (`onLayout`
  instead of ResizeObserver, drag gestures instead of wheel events).
- **`Text` paints pretext's materialized lines** — each measured line is its own
  single-line `<Text>` at `i × lineHeight`. RN's line breaker (CoreText/Minikin)
  never gets a vote, so paint can't disagree with the measured height.
- **`VStack`/`HStack`/`Escape`/`Collapse`** render as `View`s; an `HStack`
  splits width with the same `distribute` math the measure ran.

## Install

```bash
npm i @wingleeio/mugen-native
```

Requires React 18.2/19 and React Native ≥ 0.72.

## Quick start

```tsx
import {
  configureMugenNative,
  MugenVList,
  Text,
  VStack,
  useMugenVirtualizer,
} from '@wingleeio/mugen-native';

// Once at startup: the same TTFs the app paints with feed the measurement.
configureMugenNative({ fonts: [{ family: 'Inter', weight: 400, data: interTtfBytes }] });

function Inbox({ messages }: { messages: Message[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      font="16px Inter"
      lineHeight={22}
      stickToBottom
      render={(m) => (
        <VStack gap={4} padding={12}>
          <Text font="600 15px Inter">{m.author}</Text>
          <Text>{m.body}</Text>
        </VStack>
      )}
    />
  );
}
```

On Android (and for multi-weight fonts generally), map faces explicitly:

```ts
configureMugenNative({
  fonts,
  fontFaceResolver: ({ family, weight }) =>
    family === 'Inter' ? { fontFamily: `Inter_${weight}` } : { fontFamily: family },
});
```

See [`apps/native-example`](../../apps/native-example) for a complete Expo app
(streaming markdown chat, stick-to-bottom, collapse).

## Develop

```bash
pnpm --filter @wingleeio/mugen-native test         # node tests — react-native stubbed, fonts hermetic
pnpm --filter @wingleeio/mugen-native check-types
pnpm --filter @wingleeio/mugen-native build
```
