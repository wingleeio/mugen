import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { getPrimitiveDef, typeName, type MeasureContext } from './primitives/core';
import { fontEpoch } from './pretext/fonts';
import { currentSession } from './session';
import type { TextDefaults } from './text-defaults';

/**
 * Element-identity height memo. A React element is immutable, so for a fixed
 * `(width, defaults, fontEpoch)` the *same element ref* always measures to the
 * same height — re-walking it (and re-running pretext `layout()` at its leaves)
 * is wasted work. Callers that return stable element refs for unchanged subtrees
 * (mugen-markdown's per-block cache is the motivating case) then re-measure in
 * `O(changed blocks)`: a streaming row's settled blocks all hit, only its
 * growing tail block misses. Keyed by the immutable element via a WeakMap, so an
 * entry lives exactly as long as the element it describes.
 *
 * One slot per element (the last `(width, defaults)` it was measured at). Within
 * a pass each element is measured once, and across passes the row width and the
 * memoized defaults object are stable, so the slot is a hit; a real change just
 * recomputes. `fontEpoch` is folded in because settling a web font changes glyph
 * metrics without changing any element ref.
 */
interface HeightEntry {
  width: number;
  defaults: TextDefaults;
  epoch: number;
  /** The owning row's slot epoch at measure time. Keyed slots (`useMugenRow`
   *  state, tweens) change measured output without changing any element ref,
   *  so their writes bump the row epoch and invalidate entries under it. */
  slotEpoch: number;
  height: number;
}
let heightCache = new WeakMap<object, HeightEntry>();

/** Drop the height memo (tests / memory pressure). A WeakMap can't be cleared, so swap in a fresh one. */
export function clearHeightCache(): void {
  heightCache = new WeakMap<object, HeightEntry>();
}

/**
 * The walker. Interprets a row's primitive tree to derive its height with no
 * mount and no reflow: it threads `width` top-down, recurses composites, sums
 * child heights, and calls pretext at `Text` leaves. The *same* tree renders to
 * the DOM, so the analytic height and the painted box come from one description
 * and can't desync.
 *
 * Hook-using rows are handled outside the walk: the engine runs `render(item)`
 * inside the measure session (so `useMugenState`/etc. read their slots) and an
 * inert React dispatcher (so cosmetic `useState`/`useMemo` are no-ops). By the
 * time the walk runs, the tree is plain primitives.
 */
export function heightOf(node: ReactNode, width: number, defaults: TextDefaults): number {
  return measureNode(node, width, defaults);
}

export function measureNode(node: ReactNode, width: number, defaults: TextDefaults): number {
  if (node == null || typeof node === 'boolean') return 0;

  if (typeof node === 'string' || typeof node === 'number') {
    throw new Error(
      `mugen: raw text must be wrapped in <Text> to be measurable (received ${JSON.stringify(
        String(node),
      )}).`,
    );
  }

  if (Array.isArray(node)) {
    let sum = 0;
    for (const child of node) sum += measureNode(child, width, defaults);
    return sum;
  }

  if (isValidElement(node)) {
    const element = node as ReactElement;
    const epoch = fontEpoch();
    const session = currentSession();
    const slotEpoch = session ? session.host.slotEpoch(session.rowKey) : 0;
    const cached = heightCache.get(element);
    if (
      cached !== undefined &&
      cached.width === width &&
      cached.defaults === defaults &&
      cached.epoch === epoch &&
      cached.slotEpoch === slotEpoch
    ) {
      return cached.height;
    }
    const height = measureElement(element, width, defaults);
    heightCache.set(element, { width, defaults, epoch, slotEpoch, height });
    return height;
  }

  throw new Error('mugen: encountered an unmeasurable node while walking a row tree.');
}

/** Measure a single element (no cache) — the interpreter the memo wraps. */
function measureElement(element: ReactElement, width: number, defaults: TextDefaults): number {
  // A Fragment is transparent — it paints no box, so its children render as
  // direct siblings. Measure them in place (sum, like an array) at the same
  // width; this can't change the height.
  if (element.type === Fragment) {
    return measureNode((element.props as { children?: ReactNode }).children, width, defaults);
  }

  const def = getPrimitiveDef(element.type);
  if (def) {
    const ctx: MeasureContext = {
      defaults,
      width,
      measure: (child, childWidth) => measureNode(child, childWidth, defaults),
    };
    return def.measure(element.props as Record<string, unknown>, ctx);
  }

  if (typeof element.type === 'function') {
    // A plain (non-primitive) component: call it to get its primitive tree and
    // measure that. Positional mugen hooks throw here (their call order can't
    // be reproduced across the walk and the React render); `useMugenRow(id)`
    // scopes resolve through the ambient walk session.
    const name = typeName(element.type);
    try {
      const rendered = (element.type as (props: object) => ReactNode)(element.props as object);
      return measureNode(rendered, width, defaults);
    } catch (err) {
      throw annotateComponent(err, name);
    }
  }

  // Host elements (`<div>`) and other types have no `measure` — they break the
  // walk with a precise message.
  throw new Error(
    `mugen: <${typeName(element.type)}> is not a measurable primitive. A row may only ` +
      `contain Text, VStack, HStack, primitives created with definePrimitive, or ` +
      `hook-free components composed from them.`,
  );
}

/**
 * Flatten React children to an array, dropping null/booleans and splicing
 * `Fragment` children in place. A Fragment paints no box — its children are
 * direct flex siblings in the DOM — so flattening here keeps box chrome (gaps,
 * `HStack` width distribution) counting the real children, matching the render.
 *
 * Deliberately NOT `Children.toArray`: that clones every element to assign keys,
 * which would hand the height memo fresh refs each pass and defeat it. We flatten
 * arrays/Fragments by hand so each child stays the *same element ref* — the thing
 * the memo keys on. Keys are irrelevant to measurement anyway.
 */
export function toChildArray(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  flattenChildren(children, out);
  return out;
}

function flattenChildren(node: ReactNode, out: ReactNode[]): void {
  if (node == null || typeof node === 'boolean') return; // drop, like Children.toArray
  if (Array.isArray(node)) {
    for (const child of node) flattenChildren(child, out);
    return;
  }
  if (isValidElement(node) && node.type === Fragment) {
    flattenChildren((node.props as { children?: ReactNode }).children, out);
    return;
  }
  out.push(node);
}

/**
 * Sum the heights of `children` at the current width — the vertical-stack
 * measure used by `VStack`. Exposed so a custom primitive with a bespoke
 * (hook-using) render can still measure its children the standard way, e.g. a
 * wrapper that adds event handlers around the row's primitives but should
 * measure exactly as those primitives do.
 */
export function measureChildren(children: ReactNode, ctx: MeasureContext): number {
  let sum = 0;
  for (const child of toChildArray(children)) sum += ctx.measure(child, ctx.width);
  return sum;
}

/**
 * Max-content width of a node in px — the width it takes as a flex item when
 * nothing forces it to wrap — or `null` when it can't be known (a custom
 * primitive without `naturalWidth`, a host element). Plain components are
 * unwrapped to the tree they return, exactly as `measureNode` measures them.
 */
export function naturalWidthOf(node: ReactNode, ctx: MeasureContext): number | null {
  let cur: ReactNode = node;
  for (let depth = 0; depth < 32; depth++) {
    if (cur == null || typeof cur === 'boolean') return 0;
    if (!isValidElement(cur)) return null;
    const element = cur as ReactElement;
    if (element.type === Fragment) return null; // fragments are spliced before this is called
    const def = getPrimitiveDef(element.type);
    if (def) {
      return def.naturalWidth
        ? def.naturalWidth(element.props as Record<string, unknown>, ctx)
        : null;
    }
    if (typeof element.type !== 'function') return null;
    try {
      cur = (element.type as (props: object) => ReactNode)(element.props as object);
    } catch {
      return null; // let measureNode surface the real error with its component path
    }
  }
  return null;
}

/**
 * Whether a node renders outside the row's flow (its primitive is marked
 * `outOfFlow`, e.g. `Portal`) — it paints no flex item, so boxes skip it when
 * counting gaps and distributing width. Unwraps plain components like the
 * walker does.
 */
export function isOutOfFlow(node: ReactNode): boolean {
  let cur: ReactNode = node;
  for (let depth = 0; depth < 32; depth++) {
    if (!isValidElement(cur)) return false;
    const element = cur as ReactElement;
    const def = getPrimitiveDef(element.type);
    if (def) return def.outOfFlow === true;
    if (typeof element.type !== 'function') return false;
    try {
      cur = (element.type as (props: object) => ReactNode)(element.props as object);
    } catch {
      return false;
    }
  }
  return false;
}

/** Append the failing component name to a measure error, building a path. */
function annotateComponent(err: unknown, name: string): unknown {
  if (err instanceof Error) {
    err.message += `\n    in <${name}> (mugen measure pass)`;
  }
  return err;
}
