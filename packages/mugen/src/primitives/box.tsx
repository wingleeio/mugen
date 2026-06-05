import {
  createElement,
  isValidElement,
  type CSSProperties,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react';
import { markPrimitive, type MeasureContext } from './core';
import { toChildArray } from '../walker';
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

/** Read a child's declared fixed width (`width` prop), if it has one. */
function declaredWidth(node: ReactNode): number | null {
  if (isValidElement(node)) {
    const w = (node.props as { width?: unknown }).width;
    if (typeof w === 'number') return w;
  }
  return null;
}

/** Distribute `inner` width across children: fixed ones keep theirs, the rest share the remainder. */
function distribute(kids: ReactNode[], inner: number, gap: number): number[] {
  const totalGap = gap * Math.max(0, kids.length - 1);
  let fixedTotal = 0;
  let growCount = 0;
  const declared = kids.map((k) => declaredWidth(k));
  for (const d of declared) {
    if (d != null) fixedTotal += d;
    else growCount++;
  }
  const remaining = Math.max(0, inner - totalGap - fixedTotal);
  const each = growCount > 0 ? remaining / growCount : 0;
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
  const kids = toChildArray(p.children);
  if (kids.length === 0) return 2 * pad;

  if (direction === 'horizontal') {
    const widths = distribute(kids, inner, gap);
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
    alignItems: p.align,
    justifyContent: p.justify,
    ...(p.gap != null ? { gap: `${p.gap}px` } : null),
    ...(p.padding != null ? { padding: `${p.padding}px` } : null),
    ...(p.width != null ? { flex: `0 0 ${p.width}px`, width: `${p.width}px` } : null),
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
  });
}

/** Vertical layout box. `const VStack = definePrimitive('div')`. */
export const VStack = definePrimitive('div', { name: 'VStack' });

/** Horizontal layout box. `const HStack = definePrimitive('div', { direction: 'horizontal' })`. */
export const HStack = definePrimitive('div', { direction: 'horizontal', name: 'HStack' });

export type VStackProps<C extends string = string> = BoxProps<'div', C>;
export type HStackProps<C extends string = string> = BoxProps<'div', C>;
