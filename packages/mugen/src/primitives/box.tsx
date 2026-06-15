import {
  createElement,
  isValidElement,
  type CSSProperties,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getPrimitiveDef, markPrimitive, type MeasureContext } from './core';
import { isOutOfFlow, naturalWidthOf, toChildArray } from '../walker';
import type { MeasurableStyle, SafeClassName } from '../style';

export type BoxDirection = 'vertical' | 'horizontal';

/** Intrinsic props for the backing tag, minus the keys a box owns itself. */
type TagProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[Tag],
  'style' | 'className' | 'children' | 'width' | 'height'
>;

/** The layout props a box derives its height from (chrome the walker accounts for). */
export interface BoxLayoutProps {
  children?: ReactNode;
  /** Gap between children, in px (chrome in the height). */
  gap?: number;
  /** Uniform padding, in px (chrome on both axes). */
  padding?: number;
  /** Declared width, in px — used to lay out fixed siblings in an `HStack`. */
  width?: number;
  /** Declared height, in px. When set, the box's height is this, not its children's. */
  height?: number;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  /** Inline styles, minus padding/margin/gap/sizing (owned by props above). */
  style?: MeasurableStyle;
}

export type BoxProps<Tag extends keyof JSX.IntrinsicElements, C extends string> = TagProps<Tag> &
  BoxLayoutProps & {
    /** className, minus spacing/sizing utilities (which would desync the height). */
    className?: SafeClassName<C>;
  };

/** A primitive component: callable in JSX (generic over its className literal). */
export interface PrimitiveComponent<Tag extends keyof JSX.IntrinsicElements> {
  <C extends string = string>(props: BoxProps<Tag, C>): ReactElement | null;
  displayName: string;
}

const LAYOUT_KEYS = new Set([
  'children',
  'gap',
  'padding',
  'width',
  'height',
  'align',
  'justify',
  'style',
]);

/**
 * Read a child's declared fixed width (`width` prop), if it has one. A plain
 * (non-primitive) component is unwrapped to the tree it returns — the walker
 * measures it through the same call, so a component whose root is a fixed-width
 * primitive (an icon, an avatar) must distribute like that primitive: in the
 * DOM its root *is* the flex item, `flex: 0 0 width` and all.
 */
function declaredWidth(node: ReactNode): number | null {
  let cur: ReactNode = node;
  for (let depth = 0; depth < 32 && isValidElement(cur); depth++) {
    const w = (cur.props as { width?: unknown }).width;
    if (typeof w === 'number') return w;
    const type = cur.type;
    if (typeof type === 'function' && !getPrimitiveDef(type)) {
      cur = (type as (props: object) => ReactNode)(cur.props as object);
      continue;
    }
    return null;
  }
  return null;
}

/**
 * Distribute `inner` width across children the way the rendered flexbox does.
 *
 * Fixed children (`width` prop, also seen through composed components) keep
 * their width — they paint as `flex: 0 0 width` — capped at the row's inner
 * width to mirror the rendered `max-width: 100%` (a 430px chat bubble on a
 * 360px phone paints clipped at 360, so it must measure at 360 too).
 *
 * The rest paint as default flex items (`flex: 0 1 auto`): each takes its
 * *content* width, and on overflow they shrink in proportion to it. When every
 * unfixed child's max-content width is known, model exactly that; a child whose
 * natural width is unknowable (a custom primitive without `naturalWidth`)
 * makes the row fall back to an equal split of the remainder.
 */
function distribute(kids: ReactNode[], inner: number, gap: number, ctx: MeasureContext): number[] {
  const totalGap = gap * Math.max(0, kids.length - 1);
  let fixedTotal = 0;
  let growCount = 0;
  const declared = kids.map((k) => {
    const d = declaredWidth(k);
    return d != null ? Math.min(d, inner) : null;
  });
  for (const d of declared) {
    if (d != null) fixedTotal += d;
    else growCount++;
  }
  const remaining = Math.max(0, inner - totalGap - fixedTotal);
  if (growCount === 0) return declared.map((d) => d ?? 0);

  let naturalTotal = 0;
  let allKnown = true;
  const naturals = kids.map((k, i) => {
    if (declared[i] != null || !allKnown) return null;
    const n = naturalWidthOf(k, ctx);
    if (n == null) allKnown = false;
    else naturalTotal += n;
    return n;
  });
  if (allKnown) {
    if (naturalTotal <= remaining) {
      return kids.map((_, i) => declared[i] ?? naturals[i]!);
    }
    // Overflow: flex shrinks each auto item in proportion to its content size
    // (all defaults: shrink 1, basis auto; text breaks via overflow-wrap).
    const scale = naturalTotal > 0 ? remaining / naturalTotal : 0;
    return kids.map((_, i) => declared[i] ?? naturals[i]! * scale);
  }
  const each = remaining / growCount;
  return declared.map((d) => (d != null ? d : each));
}

function measureBox(
  props: Record<string, unknown>,
  ctx: MeasureContext,
  direction: BoxDirection,
): number {
  const p = props as BoxLayoutProps;
  // A declared height is authoritative — the box does not derive it from children.
  if (typeof p.height === 'number') return p.height;

  const gap = p.gap ?? 0;
  const pad = p.padding ?? 0;
  const inner = Math.max(0, ctx.width - 2 * pad);
  // Out-of-flow children (Portal) paint no flex item — they take no width
  // share and add no gap, so they are excluded from the layout math entirely.
  const kids = toChildArray(p.children).filter((k) => !isOutOfFlow(k));
  if (kids.length === 0) return 2 * pad;

  if (direction === 'horizontal') {
    const widths = distribute(kids, inner, gap, ctx);
    let maxH = 0;
    for (let i = 0; i < kids.length; i++) {
      maxH = Math.max(maxH, ctx.measure(kids[i], widths[i] ?? inner));
    }
    return maxH + 2 * pad;
  }

  let sum = 0;
  for (const k of kids) sum += ctx.measure(k, inner);
  return sum + gap * (kids.length - 1) + 2 * pad;
}

/**
 * Max-content width of a box: its declared `width`, or the content's —
 * children side by side for a row (sum + gaps), the widest child for a
 * column — plus padding. `null` bubbles up from any child whose natural
 * width is unknowable.
 */
function naturalBoxWidth(
  props: Record<string, unknown>,
  ctx: MeasureContext,
  direction: BoxDirection,
): number | null {
  const p = props as BoxLayoutProps;
  if (typeof p.width === 'number') return p.width;
  const pad = p.padding ?? 0;
  const gap = p.gap ?? 0;
  const kids = toChildArray(p.children).filter((k) => !isOutOfFlow(k));
  if (kids.length === 0) return 2 * pad;
  if (direction === 'horizontal') {
    let sum = 0;
    for (const k of kids) {
      const w = naturalWidthOf(k, ctx);
      if (w == null) return null;
      sum += w;
    }
    return sum + gap * (kids.length - 1) + 2 * pad;
  }
  let max = 0;
  for (const k of kids) {
    const w = naturalWidthOf(k, ctx);
    if (w == null) return null;
    max = Math.max(max, w);
  }
  return max + 2 * pad;
}

function renderBox(
  tag: keyof JSX.IntrinsicElements,
  props: Record<string, unknown>,
  direction: BoxDirection,
): ReactElement {
  const p = props as BoxProps<keyof JSX.IntrinsicElements, string>;
  const rest: Record<string, unknown> = {};
  for (const key in props) {
    if (!LAYOUT_KEYS.has(key)) rest[key] = props[key];
  }
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    // Neutralize UA styles the walker can't see: tags like `blockquote` or
    // `button` carry default margins/borders/padding, and `content-box`
    // sizing would paint a fixed-width padded box wider than it measures.
    // The measure assumes exactly `padding ?? 0` and no border, so the render
    // pins both (an author can re-add chrome via `style`, owning the desync).
    margin: 0,
    border: 0,
    boxSizing: 'border-box',
    padding: `${p.padding ?? 0}px`,
    // A flex item's default `min-width: auto` floors it at its content's
    // min-content, so a child with an unbreakable wide subtree (a `<pre>` that
    // scrolls, a long line of code) would expand the box past its measured width
    // instead of shrinking. The measure (`distribute`) already models proportional
    // shrink with no such floor, so pin `min-width: 0` to make the render match —
    // overflowing content then scrolls within the box rather than widening it.
    minWidth: 0,
    alignItems: p.align,
    justifyContent: p.justify,
    ...(p.gap != null ? { gap: `${p.gap}px` } : null),
    // A fixed-width child keeps `flex-shrink: 0` so a wide sibling (e.g. a long
    // message next to an avatar) can never squeeze it — the sibling wraps
    // instead. `max-width: 100%` (with `min-width: 0`) still clamps the child to
    // the row when its own declared width exceeds it (e.g. a 430px chat bubble
    // on a 360px phone), which max-size clamping applies even at shrink 0. Both
    // match the clamp the measure pass applies in `distribute`.
    ...(p.width != null
      ? { flex: `0 0 ${p.width}px`, width: `${p.width}px`, maxWidth: '100%', minWidth: 0 }
      : null),
    ...(p.height != null ? { height: `${p.height}px` } : null),
    ...(p.style as CSSProperties | undefined),
  };
  return createElement(tag, { ...rest, style }, p.children);
}

export interface DefinePrimitiveOptions {
  /** Lay children out vertically (default) or horizontally. */
  direction?: BoxDirection;
  /** Display name for devtools / measure errors. Defaults to the tag. */
  name?: string;
}

/**
 * Make a measurable primitive backed by an HTML `tag` — e.g.
 * `const Button = definePrimitive('button')`. The result is a layout box (like
 * `VStack`/`HStack`, which are defined this way) with measurable chrome props
 * (`gap`, `padding`, `width`, `height`) and type-restricted `style`/`className`,
 * plus the tag's own attributes (`onClick`, `href`, …) passed straight through.
 */
export function definePrimitive<Tag extends keyof JSX.IntrinsicElements>(
  tag: Tag,
  options: DefinePrimitiveOptions = {},
): PrimitiveComponent<Tag> {
  const direction = options.direction ?? 'vertical';
  const name = options.name ?? tag;
  const Component = ((props: BoxProps<Tag, string>) =>
    renderBox(tag, props as Record<string, unknown>, direction)) as PrimitiveComponent<Tag>;
  Component.displayName = name;
  return markPrimitive(Component, {
    name,
    measure: (props, ctx) => measureBox(props, ctx, direction),
    naturalWidth: (props, ctx) => naturalBoxWidth(props, ctx, direction),
  });
}

/** Vertical layout box. `const VStack = definePrimitive('div')`. */
export const VStack = definePrimitive('div', { name: 'VStack' });

/** Horizontal layout box. `const HStack = definePrimitive('div', { direction: 'horizontal' })`. */
export const HStack = definePrimitive('div', { direction: 'horizontal', name: 'HStack' });

export type VStackProps<C extends string = string> = BoxProps<'div', C>;
export type HStackProps<C extends string = string> = BoxProps<'div', C>;
