# mugen-markdown-native

[mugen-markdown](../mugen-markdown) for **React Native** — markdown whose exact
height mugen's walker computes analytically, streaming-native, with the same
parser, theme, and height math as the web.

It is a *renderer*, not a fork. Everything upstream of paint is the web package,
imported via `@wingleeio/mugen-markdown/native-core`: incremark parsing with the
streaming caches, the mdast→runs inline pipeline, theming, the dispatcher's
two-tier block memoization, and the syntax tokenizer. What's native:

- **`RichText`** paints pretext's rich-inline geometry directly — every line is
  materialized into fragments and each fragment is a single-line `<Text>` at its
  exact measured x/y. Mixed fonts, inline code chips, links, inline boxes: all
  positioned by the same math that computed the height.
- **`CodeBlock`** renders tokenizer-colored lines in a horizontal `ScrollView`;
  height is `header + lines × lineHeight + padding`, pinned.
- **`TableBlock`** resolves the shared column ratios to pixel widths per cell.
- **`FadeMarkdown`** fades newly streamed lines in (opacity only — heights are
  untouched). Coarser than the web's per-character veil, by design.

## Install

```bash
npm i @wingleeio/mugen-markdown-native @wingleeio/mugen-native
```

## Quick start

```tsx
import { MugenVList, useMugenVirtualizer } from '@wingleeio/mugen-native';
import { Markdown } from '@wingleeio/mugen-markdown-native';

function Chat({ messages }: { messages: Message[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      font="15px Inter"
      lineHeight={22}
      stickToBottom
      render={(m) => (
        <Markdown
          source={m.body}
          fade
          theme={{ fontFamily: 'Inter', monoFamily: 'JetBrains Mono' }}
        />
      )}
    />
  );
}
```

Set concrete families in the theme (React Native has no CSS generic fallback);
register the same TTFs with `configureMugenNative({ fonts })` so measurement
and paint share one source of truth.

Copy buttons on code blocks need a clipboard implementation — wire one once:

```ts
import { setCodeCopyHandler } from '@wingleeio/mugen-markdown-native';
import * as Clipboard from 'expo-clipboard';

setCodeCopyHandler((text) => Clipboard.setStringAsync(text));
```

## Differences from the web (by design)

- Fade granularity is per new line, not per character.
- The code-block copy button renders only when a copy handler is set.
- Raw HTML blocks are dropped (as on the web) and CSS color sentinels
  (`inherit`) resolve to the theme's `color`.

## Develop

```bash
pnpm --filter @wingleeio/mugen-markdown-native test         # node — react-native stubbed, hermetic fonts
pnpm --filter @wingleeio/mugen-markdown-native check-types
pnpm --filter @wingleeio/mugen-markdown-native build
```
