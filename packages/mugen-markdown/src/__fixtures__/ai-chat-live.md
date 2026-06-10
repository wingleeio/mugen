Yes — and it lands on the very first try:

```tsx
list.scrollToItem("41212", { align: "center", behavior: "smooth" });
```

Because every row’s offset already lives in the index, it’s **dead-center** immediately — no measure-on-arrival, no second correction, no scrollbar jump.

## Putting it all together

Here’s the whole flow, end to end. Every row is a pure `item → tree`, the walker derives its height analytically, and **nothing ever touches the DOM to measure**.

### What you get

- **Exact heights up front** — even for rows that never mount
- **O(log n)** scroll math via a Fenwick offset index
- **Zero layout shift** — one description feeds both measure *and* render
- Pixel-exact `scrollToItem`, on- or off-screen
- Streaming markdown that re-parses *incrementally* as it grows

### Setting it up

1. Create one virtualizer over your data
2. Render each row through `MugenVList`
3. Author the row from primitives — or drop in `<Markdown>`
4. Keep height-affecting state in `useMugenState`

```tsx
const list = useMugenVirtualizer({ items: messages });

return (
  <MugenVList
    instance={list}
    getKey={(m) => m.id}
    render={(m) => <Markdown source={m.body} />}
    initialScroll="bottom"
    stickToBottom
  />
);
```

### Why it scales

| rows | what mounts | scroll |
|------|-------------|--------|
| 1k | visible slice | 60fps |
| 50k | visible slice | 60fps |
| 1M | visible slice | 60fps |

Only the visible window mounts, so the row *count* stops being the bottleneck — your data is.

> One description of a row feeds both the measurement walk and the React render, so the height you compute is the height that paints.

And streaming? The answer you’re reading **streamed in word by word** just now:

1. each chunk appended to a retained incremark parser (`O(delta)`)
2. the walker re-measured *this one row*
3. `stickToBottom` followed it down — until you scroll up to break free

That’s the entire idea: heights are *computed*, not measured; markdown is *parsed incrementally*, not re-parsed; and the list stays honest whether it’s **5 messages or a million**.