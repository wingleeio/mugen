import { createElement, type CSSProperties, type JSX, type ReactElement, type ReactNode } from 'react';
import { markPrimitive } from './core';

/** Intrinsic `div` props, minus the keys `Escape` owns itself. */
type EscapeTagProps = Omit<
  JSX.IntrinsicElements['div'],
  'style' | 'className' | 'children' | 'width' | 'height'
>;

export interface EscapeProps extends EscapeTagProps {
  /**
   * Anything — the children are **never walked**, so the usual "only primitives
   * are measurable" rule does not apply inside an `Escape`. Hooks, host
   * elements, Radix/shadcn widgets, charts: all fine. They render as ordinary
   * React inside the declared box.
   */
  children?: ReactNode;
  /**
   * The frame's border-box height in px — authoritative for the walk *and* the
   * paint. Content taller than this is clipped (see `style.overflow`), never
   * silently re-measured: design the children to the box you declare.
   */
  height: number;
  /**
   * Declared width in px. In an `HStack` the frame lays out as a fixed sibling
   * (`flex: 0 0 auto`, clamped to the row) and reports this as its natural
   * width. Without it the frame stretches in a column; in a row, siblings fall
   * back to an equal width split (the content's painted width is unknowable),
   * so give an `Escape` inside an `HStack` a `width` when its siblings wrap.
   */
  width?: number;
  /**
   * Unrestricted CSS. The painted height is pinned inline from the `height`
   * prop and the box is `border-box`, so the frame's own padding/border can't
   * change its outer size; override `height`/`margin` here and you own the
   * desync (same contract as a box's `style`).
   */
  style?: CSSProperties;
  /** Unrestricted className — the inline height pin beats utility classes. */
  className?: string;
}

function EscapeComponent(props: EscapeProps): ReactElement {
  const { children, height, width, style, ...rest } = props;
  const frame: CSSProperties = {
    // The frame the walker counts: exactly `height` tall, border-box so author
    // padding/border can't change the outer size, clipped so content that
    // violates the declared height shows up at the source instead of painting
    // over the next row.
    position: 'relative',
    margin: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    height: `${height}px`,
    // `flex-basis: auto` (not the width) so that inside a *column* the basis
    // resolves to the pinned height, never the width.
    ...(width != null
      ? { flex: '0 0 auto', width: `${width}px`, maxWidth: '100%', minWidth: 0 }
      : null),
    ...style,
  };
  return createElement('div', { ...rest, style: frame }, children);
}
EscapeComponent.displayName = 'Escape';

/**
 * A fixed-size box that **escapes the walker**: it stays in the row's flow at a
 * declared `height` (and optional `width`), but its children are never walked —
 * so they may be arbitrary non-primitive React. A shadcn `<Tooltip>`, a Radix
 * menu, a chart, an `<img>`: anything with a known footprint drops in, and any
 * floating content it portals (Radix portals to `document.body`) never touches
 * the row's layout at all.
 *
 * The contract is `foreignObject`'s: mugen reserves exactly the box you
 * declare, and you design the children within it. The walker reads `height`
 * without recursing, the render pins the same height inline, and overflow is
 * clipped — so the painted row can never desync from the computed one, even if
 * the children misbehave.
 *
 * Reach for `Escape` when the content's footprint is *known* (icon buttons,
 * avatars, badges, embeds, toolbars). Content whose height must come from the
 * text itself — wrapping paragraphs, markdown — still belongs to measured
 * primitives.
 */
export const Escape = markPrimitive(EscapeComponent as (props: EscapeProps) => ReactElement, {
  name: 'Escape',
  // The declared height is authoritative; children are never walked.
  measure: (props) => (props as unknown as EscapeProps).height,
  naturalWidth: (props) => (props as unknown as EscapeProps).width ?? null,
});
