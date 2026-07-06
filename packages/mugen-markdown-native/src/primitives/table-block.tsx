import { useContext, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  getPrimitiveDef,
  markPrimitive,
  naturalWidthOf,
  type MeasureContext,
} from '@wingleeio/mugen/native-core';
import { TableBlock as WebTableBlock } from '@wingleeio/mugen-markdown/native-core';
import { WidthContext } from '@wingleeio/mugen-native';

export interface TableBlockProps {
  /** Cell content per row, header row first. Rows may be ragged. */
  rows: ReactNode[][];
  /** Uniform cell padding in px (counted in the height). */
  cellPadding: number;
  /** Hairline between rows and the outer ring, in px. 0 disables both. */
  divider: number;
  borderColor: string;
  headerBackground: string;
  /** Corner radius in px (clip only — no height impact). */
  radius: number;
}

const webDef = getPrimitiveDef(WebTableBlock)!;

// Same floor and stub context as the web renderer — the ratio arithmetic must
// come out identical in the measure walk and this render.
const MIN_COLUMN_CONTENT = 48;
const STUB_CTX: MeasureContext = { defaults: {}, width: 0, measure: () => 0 };

function columnCount(rows: ReactNode[][]): number {
  let n = 0;
  for (const row of rows) n = Math.max(n, row.length);
  return n;
}

function columnRatios(p: TableBlockProps): number[] {
  const cols = columnCount(p.rows);
  const ratios = new Array<number>(cols).fill(MIN_COLUMN_CONTENT);
  for (const row of p.rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell == null) continue;
      let w: number | null;
      try {
        w = naturalWidthOf(cell, STUB_CTX);
      } catch {
        return new Array<number>(cols).fill(1);
      }
      if (w == null) return new Array<number>(cols).fill(1);
      if (w > ratios[c]!) ratios[c] = w;
    }
  }
  return ratios.map((r) => r + 2 * p.cellPadding);
}

/**
 * The native render half: rows of explicit pixel-width cells. The web version
 * lets flexbox resolve `flex: ratio ratio 0`; here the same
 * `width × ratio / Σratios` arithmetic runs in JS and each cell gets its exact
 * width plus a `WidthContext` so the RichText inside wraps precisely where the
 * measure said. Hairlines are real Views (counted in the height); the outer
 * ring is an absolutely-positioned overlay (height-neutral, the web's inset
 * box-shadow analog).
 */
function TableBlockComponent(props: TableBlockProps): ReactElement | null {
  const width = useContext(WidthContext);
  const cols = columnCount(props.rows);
  if (props.rows.length === 0 || cols === 0) return null;
  const ratios = columnRatios(props);
  const total = ratios.reduce((a, b) => a + b, 0);
  const colWidths = ratios.map((r) => (total > 0 && width > 0 ? (width * r) / total : 0));

  const children: ReactNode[] = [];
  props.rows.forEach((row, r) => {
    if (r > 0 && props.divider > 0) {
      children.push(
        <View
          key={`d${r}`}
          style={{ height: props.divider, backgroundColor: props.borderColor }}
        />,
      );
    }
    children.push(
      <View
        key={r}
        style={{
          flexDirection: 'row',
          ...(r === 0 ? { backgroundColor: props.headerBackground } : null),
        }}
      >
        {Array.from({ length: cols }, (_, c) => {
          const w = colWidths[c] ?? 0;
          return (
            <View key={c} style={{ width: w, padding: props.cellPadding }}>
              <WidthContext.Provider value={Math.max(0, w - 2 * props.cellPadding)}>
                {row[c] ?? null}
              </WidthContext.Provider>
            </View>
          );
        })}
      </View>,
    );
  });

  return (
    <View
      style={{
        ...(props.radius > 0 ? { borderRadius: props.radius, overflow: 'hidden' } : null),
      }}
    >
      {children}
      {props.divider > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: props.divider,
            borderColor: props.borderColor,
            ...(props.radius > 0 ? { borderRadius: props.radius } : null),
          }}
        />
      ) : null}
    </View>
  );
}
TableBlockComponent.displayName = 'TableBlock';

/** Measured exactly like the web `TableBlock` (shared ratio + row-height math). */
export const TableBlock = markPrimitive(
  TableBlockComponent as (props: TableBlockProps) => ReactElement | null,
  {
    name: 'TableBlock',
    measure: webDef.measure,
    naturalWidth: webDef.naturalWidth,
  },
);
