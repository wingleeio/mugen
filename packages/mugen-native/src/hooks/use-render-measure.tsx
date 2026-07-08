'use no memo';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { type LayoutChangeEvent, Platform, type View } from 'react-native';

import { useMugenRow } from '@wingleeio/mugen/native-core';

/**
 * Render-measure escape hatch (mugen/NATIVE-TEXT.md). For content the analytic
 * engine can't model — system fallback glyphs, unusual emoji sequences,
 * arbitrary embedded views — mount the row, read its TRUE height from the
 * native view, and feed it through the engine's estimate→anchor-absorption
 * channel (`MugenRowScope.renderMeasure` → `applyMeasuredHeight`). pretext-core
 * stays authoritative for everything it models; this only corrects a specific
 * row, and only when the rendered height actually differs from the analytic
 * one.
 *
 * Usage inside a row's `render`:
 *   const measure = useRenderMeasure(id);
 *   return <View ref={measure.ref} onLayout={measure.onLayout}>…</View>;
 *
 * On Fabric, `ref.measure()` is synchronous inside `useLayoutEffect` (verified
 * from legend-list's `useOnLayoutSync.native.tsx`): the C++ shadow tree is
 * already laid out by commit, so we read the true height before paint and the
 * anchor absorption keeps the viewport stable. `onLayout` is the fallback for
 * the old renderer / async cases; both funnel through `apply`, which is
 * idempotent (the engine ignores sub-pixel deltas).
 *
 * `id` must be unique within the row (it names a `useMugenRow` scope).
 */
export function useRenderMeasure(id: string): {
  ref: (node: View | null) => void;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const row = useMugenRow(id);
  const nodeRef = useRef<View | null>(null);
  const lastRef = useRef<number>(-1);

  const apply = useCallback(
    (height: number) => {
      if (!(height >= 0)) return;
      // Cheap client-side dedupe before crossing into the engine; the engine
      // also guards, but this avoids waking subscribers for no-op layouts.
      if (Math.abs(height - lastRef.current) < 0.5) return;
      lastRef.current = height;
      row.renderMeasure(height);
    },
    [row],
  );

  const ref = useCallback((node: View | null) => {
    nodeRef.current = node;
  }, []);

  // Fabric: synchronous measure in the commit, before paint.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || Platform.OS === 'web') return;
    // measure() calls back synchronously on Fabric; on the old renderer it may
    // be async, in which case onLayout carries the height instead.
    node.measure((_x, _y, _w, h) => apply(h));
  });

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => apply(e.nativeEvent.layout.height),
    [apply],
  );

  return { ref, onLayout };
}
