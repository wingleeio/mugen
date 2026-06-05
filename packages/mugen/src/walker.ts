import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { getPrimitiveDef, typeName, type MeasureContext } from './primitives/core';
import type { TextDefaults } from './text-defaults';

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
      // measure that. It must be hook-free — mugen hooks throw here because the
      // measure session only spans the row's `render(item)` call, not the walk.
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

  throw new Error('mugen: encountered an unmeasurable node while walking a row tree.');
}

/** Flatten React children to an array, dropping null/booleans. */
export function toChildArray(children: ReactNode): ReactNode[] {
  return Children.toArray(children);
}

/** Append the failing component name to a measure error, building a path. */
function annotateComponent(err: unknown, name: string): unknown {
  if (err instanceof Error) {
    err.message += `\n    in <${name}> (mugen measure pass)`;
  }
  return err;
}
