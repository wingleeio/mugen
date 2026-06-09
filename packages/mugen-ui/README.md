# @wingleeio/mugen-ui

Measurable overlay primitives for [`@wingleeio/mugen`](../mugen) — **Tooltip**,
**Popover**, **Dropdown**, and **Dialog**.

Overlays are the case that breaks an analytic virtualizer: a tooltip or dropdown
is a real React component (it uses hooks), and its popover is *portaled*, so it
can't be measured by walking a primitive tree — the walker would throw if it
tried. mugen-ui splits the two halves:

- the **trigger** is registered as a mugen primitive, so the walker measures it
  like any other content and it contributes its real height to the row;
- the **content** lives in mugen's `Portal` — measured as **0** and never walked
  — so the popover/menu/dialog can be arbitrary React and never re-flows the list
  when it opens.

Because the trigger is measured for real (not against a parallel "measure"
description), a row's height can't desync from what paints.

## Install

```bash
npm i @wingleeio/mugen-ui @wingleeio/mugen
```

Requires React 18.2 or 19 (and `react-dom`). ESM + CJS. No other dependencies —
positioning, dismissal, focus, and keyboard nav are self-contained.

## Quick start

Each widget is a compound component. Put the trigger's measurable content inside
`*.Trigger` (mugen primitives) and anything else inside `*.Content` (any React):

```tsx
import { MugenVList, Text, VStack, HStack, useMugenVirtualizer } from '@wingleeio/mugen';
import { Tooltip, Dropdown } from '@wingleeio/mugen-ui';

function Member(m: Member) {
  return (
    <HStack gap={12} padding={12} align="center">
      <Tooltip>
        <Tooltip.Trigger>
          {/* measured — contributes the row's height */}
          <VStack gap={2}>
            <Text font="600 13px Inter">{m.name}</Text>
            <Text>{m.role}</Text>
          </VStack>
        </Tooltip.Trigger>
        {/* portaled — any React, measured as 0 */}
        <Tooltip.Content className="tooltip">{m.email}</Tooltip.Content>
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
  return <MugenVList instance={list} getKey={(m) => m.id} render={Member} font="14px Inter" lineHeight={20} />;
}
```

> The children of a `*.Trigger` must be **mugen primitives** (`Text`, `VStack`,
> a `definePrimitive` box, …) — they get walked. The children of a `*.Content`
> can be anything, since the content is never measured.

## The widgets

| Widget     | Trigger opens on | Content                                        |
| ---------- | ---------------- | ---------------------------------------------- |
| `Tooltip`  | hover / focus    | anchored bubble, click-through, closes on leave |
| `Popover`  | click            | anchored panel, dismiss on Escape / outside     |
| `Dropdown` | click            | anchored menu with arrow / Home / End roving focus; `Dropdown.Item onSelect` closes it |
| `Dialog`   | click            | centered modal + backdrop; focus moves in on open and restores on close; `Dialog.Close` dismisses |

`*.Content` accepts `side` (`top`/`bottom`/`left`/`right`), `align`
(`start`/`center`/`end`), and `gap` for anchored widgets. Positions are clamped
to the viewport and recomputed on scroll/resize.

## How it works

mugen measures a row by walking its primitive tree with no DOM — a primitive's
`measure()` runs, its render body does not. mugen-ui leans on that:

- **Root** and **Content** use hooks, so they're registered as primitives (the
  walker would otherwise *call* a plain component during the measure pass and
  throw on the hooks). Root's `measure()` sums its children; Content's is
  `() => 0`.
- **Trigger** is a primitive whose `measure()` is `measureChildren` — it walks
  the trigger's children exactly — while its render is a plain wrapper carrying
  the event handlers. The anchor element is captured from the opening event, so
  no forwarded React ref is needed (identical on React 18 and 19).

See [`Portal`](../mugen) and `measureChildren` in mugen core — the two
building blocks this package is composed from.

## Develop

```bash
pnpm --filter @wingleeio/mugen-ui test          # measure-contract tests
pnpm --filter @wingleeio/mugen-ui check-types
pnpm --filter @wingleeio/mugen-ui build         # ESM + CJS + d.ts via tsdown
```
