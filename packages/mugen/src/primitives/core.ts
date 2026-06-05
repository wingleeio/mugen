import type { ReactNode } from 'react';
import type { TextDefaults } from '../text-defaults';

/**
 * Passed to a primitive's `measure()`. `width` is the content width allocated to
 * this node; `measure()` recurses into children at whatever width the primitive
 * decides (the walker threads it top-down). `defaults` are the list-level text
 * defaults, so a `Text` with no `font` prop can fall back to them.
 */
export interface MeasureContext {
  readonly defaults: TextDefaults;
  readonly width: number;
  /** Measure a child subtree at a given width; returns its height in px. */
  measure(node: ReactNode, width: number): number;
}

/** The measure half of a primitive, attached to its component for the walker. */
export interface MeasurableDef {
  readonly name: string;
  measure(props: Record<string, unknown>, ctx: MeasureContext): number;
}

// Registered symbol so duplicate copies of mugen still recognize each other's
// primitives.
const PRIMITIVE: unique symbol = Symbol.for('mugen.primitive') as typeof PRIMITIVE;

/** Tag a component with its measure definition so the walker can find it. */
export function markPrimitive<F extends object>(component: F, def: MeasurableDef): F {
  Object.defineProperty(component, PRIMITIVE, { value: def, enumerable: false });
  return component;
}

/** Return the measure definition attached to an element type, if any. */
export function getPrimitiveDef(type: unknown): MeasurableDef | undefined {
  if (typeof type === 'function') {
    return (type as unknown as Record<PropertyKey, unknown>)[PRIMITIVE] as MeasurableDef | undefined;
  }
  return undefined;
}

/** Best-effort display name for an element type, for error messages. */
export function typeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName ?? fn.name ?? 'Component';
  }
  if (type == null) return String(type);
  return 'Unknown';
}
