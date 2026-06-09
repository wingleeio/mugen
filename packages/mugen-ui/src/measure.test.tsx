import { describe, expect, it } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';
import { getPrimitiveDef, type MeasureContext } from '@wingleeio/mugen';
import { Tooltip } from './tooltip';
import { Popover } from './popover';
import { Dropdown } from './dropdown';
import { Dialog } from './dialog';

/**
 * A measure context that mirrors mugen's walker: primitives are measured via
 * their attached `measure()`; a test `<Leaf h={n} />` stands in for a measured
 * row primitive (e.g. a `<Text>`), returning a fixed height without needing
 * pretext. This lets us assert the measure *contracts* of the overlay
 * primitives without a real layout engine.
 */
function makeCtx(width: number): MeasureContext {
  const ctx: MeasureContext = {
    width,
    defaults: {} as MeasureContext['defaults'],
    measure(node: ReactNode, w: number): number {
      if (Array.isArray(node)) return node.reduce((sum, n) => sum + ctx.measure(n, w), 0);
      if (isValidElement(node)) {
        const el = node as { type: unknown; props: Record<string, unknown> };
        const def = getPrimitiveDef(el.type);
        if (def) return def.measure(el.props, { ...ctx, width: w });
        if (typeof el.props.h === 'number') return el.props.h; // a <Leaf h={n} />
      }
      return 0;
    },
  };
  return ctx;
}

const Leaf = (_: { h: number }) => null;
const leaf = (h: number) => createElement(Leaf, { h });

/** Measure a whole overlay element through its Root primitive. */
function measure(element: ReturnType<typeof createElement>, width = 300): number {
  const def = getPrimitiveDef(element.type);
  if (!def) throw new Error('not a primitive');
  return def.measure(element.props as Record<string, unknown>, makeCtx(width));
}

describe.each([
  ['Tooltip', Tooltip],
  ['Popover', Popover],
  ['Dropdown', Dropdown],
  ['Dialog', Dialog],
])('%s measurement', (_name, W) => {
  const Root = W as unknown as ((p: { children: ReactNode }) => ReactNode) & {
    Trigger: (p: { children: ReactNode }) => ReactNode;
    Content: (p: { children?: ReactNode }) => ReactNode;
  };

  it('the trigger contributes its real height; the content contributes 0', () => {
    const el = createElement(Root, {
      children: [
        createElement(Root.Trigger, { key: 't', children: leaf(24) }),
        createElement(Root.Content, { key: 'c', children: leaf(999) }),
      ],
    });
    // 24 (trigger's measured child) + 0 (portaled content) — the 999 never counts.
    expect(measure(el)).toBe(24);
  });

  it('content measures as 0 and never walks its children', () => {
    const Boom = () => {
      throw new Error('content children must never be walked');
    };
    const content = createElement(Root.Content, { children: createElement(Boom, {}) });
    expect(measure(createElement(Root, { children: content }))).toBe(0);
  });
});
