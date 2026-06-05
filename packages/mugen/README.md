# mugen

Virtualized React lists whose row heights are **computed** — with
[`@chenglou/pretext`](https://github.com/chenglou/pretext) — instead of measured
from the DOM. One description of a row feeds both the measurement and the render,
so they can't desync; off-screen and never-mounted rows have exact heights and
there's no measure-on-mount layout shift.

Full documentation lives in [`apps/docs`](../../apps/docs).

## Quick start

```tsx
import { MugenVList, Text, VStack, useMugenVirtualizer } from 'mugen';

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
        <VStack gap={4} padding={12}>
          <Text font="600 15px Inter">{m.author}</Text>
          <Text>{m.body}</Text>
        </VStack>
      )}
    />
  );
}
```

- **`useMugenVirtualizer({ items })`** → the list instance (`instance.scrollToItem(key, { behavior, align })`).
- **`<MugenVList instance getKey render>`** windows the data; `render` returns a tree of primitives.
- **Primitives:** `Text`, `VStack`, `HStack`, and `definePrimitive('button')` for any tag. `style`/`className` reject spacing/sizing utilities at the type level.
- **Row hooks:** `useMugenState` (height-affecting state; `set` re-measures that row, even off-screen), `useMugenMemo`, `useMugenEffect` (runs for every row — transform content, then `set`).

## Develop

```bash
pnpm --filter mugen test          # node tests (happy-dom, pretext mocked)
pnpm --filter mugen test:browser  # real-browser accuracy gate (Playwright/Chromium)
pnpm --filter mugen check-types
pnpm --filter mugen build         # ESM + CJS + d.ts via tsdown
```
