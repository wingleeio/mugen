import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  markPrimitive,
  naturalWidthOf,
  type MeasurableStyle,
  type MeasureContext,
  type SafeClassName,
} from '@wingleeio/mugen/native-core';

/**
 * A GFM table that *looks* like a table and is still exactly measurable.
 *
 * Every row shares one set of column widths, proportional to each column's
 * max-content width across all rows (floored so a tiny column stays
 * readable). Cells paint as `flex: ratio ratio 0` — with basis 0, flexbox
 * resolves each column to `width × ratio / Σratios`, which is the same
 * arithmetic the measure runs, so the heights agree at any width and the
 * columns align across rows.
 *
 * Chrome is height-neutral by construction: row hairlines are real
 * `divider`-px elements (counted in the height), while the outer ring is an
 * inset box-shadow and the corner radius is pure overflow clipping — neither
 * consumes width or height the walker can't see.
 */
export interface TableBlockProps<C extends string = string> {
  /** Cell content per row, header row first. Rows may be ragged. */
  rows: ReactNode[][];
  /** Uniform cell padding in px (counted in the height). */
  cellPadding: number;
  /** Hairline between rows and the outer ring, in px. 0 disables both. */
  divider: number;
  /** Hairline / ring colour. */
  borderColor: string;
  /** Background behind the header row. */
  headerBackground: string;
  /** Corner radius in px (clip only — no height impact). */
  radius: number;
  style?: MeasurableStyle;
  className?: SafeClassName<C>;
}

/**
 * Floor for a column's content share, so a short column ("1k") beside a prose
 * column keeps a readable width instead of wrapping per character.
 */
const MIN_COLUMN_CONTENT = 48;

// Cell natural widths must come out identical in the measure walk and the
// React render. The markdown cells are RichText, whose `naturalWidth` ignores
// the context, so a stub context keeps the render-side computation honest.
const STUB_CTX: MeasureContext = { defaults: {}, width: 0, measure: () => 0 };

function columnCount(rows: ReactNode[][]): number {
  let n = 0;
  for (const row of rows) n = Math.max(n, row.length);
  return n;
}

/**
 * Per-column flex ratios: max-content width of the column (plus padding), or
 * `null` when some cell's natural width is unknowable (→ equal columns).
 */
function columnRatios(p: TableBlockProps, ctx: MeasureContext): number[] | null {
  const cols = columnCount(p.rows);
  const ratios = new Array<number>(cols).fill(MIN_COLUMN_CONTENT);
  for (const row of p.rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell == null) continue;
      let w: number | null;
      try {
        w = naturalWidthOf(cell, ctx);
      } catch {
        // No canvas text metrics here (SSR, DOM shims) — equal columns. The
        // client render recomputes with real metrics.
        return null;
      }
      if (w == null) return null;
      if (w > ratios[c]!) ratios[c] = w;
    }
  }
  return ratios.map((r) => r + 2 * p.cellPadding);
}

function ratiosOrEqual(p: TableBlockProps, ctx: MeasureContext): number[] {
  return columnRatios(p, ctx) ?? new Array<number>(columnCount(p.rows)).fill(1);
}

function measureTable(p: TableBlockProps, ctx: MeasureContext): number {
  const rows = p.rows;
  const cols = columnCount(rows);
  if (rows.length === 0 || cols === 0) return 0;
  const ratios = ratiosOrEqual(p, ctx);
  const total = ratios.reduce((a, b) => a + b, 0);
  let height = (rows.length - 1) * p.divider;
  for (const row of rows) {
    let rowH = 2 * p.cellPadding;
    for (let c = 0; c < cols; c++) {
      const cell = row[c];
      if (cell == null) continue;
      const colW = total > 0 ? (ctx.width * ratios[c]!) / total : 0;
      const inner = Math.max(0, colW - 2 * p.cellPadding);
      rowH = Math.max(rowH, ctx.measure(cell, inner) + 2 * p.cellPadding);
    }
    height += rowH;
  }
  return height;
}

function renderTableBlock(p: TableBlockProps): ReactElement {
  const cols = columnCount(p.rows);
  const ratios = ratiosOrEqual(p, STUB_CTX);
  const outer: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    ...(p.radius > 0 ? { borderRadius: `${p.radius}px`, overflow: 'hidden' } : null),
    ...(p.divider > 0 ? { boxShadow: `inset 0 0 0 ${p.divider}px ${p.borderColor}` } : null),
    ...(p.style as CSSProperties | undefined),
  };
  const children: ReactNode[] = [];
  p.rows.forEach((row, r) => {
    if (r > 0 && p.divider > 0) {
      children.push(
        createElement('div', {
          key: `d${r}`,
          style: { height: `${p.divider}px`, background: p.borderColor, flex: 'none' },
        }),
      );
    }
    children.push(
      createElement(
        'div',
        {
          key: r,
          style: { display: 'flex', ...(r === 0 ? { background: p.headerBackground } : null) },
        },
        Array.from({ length: cols }, (_, c) =>
          createElement(
            'div',
            {
              key: c,
              style: {
                flex: `${ratios[c]} ${ratios[c]} 0px`,
                minWidth: 0,
                boxSizing: 'border-box',
                padding: `${p.cellPadding}px`,
              },
            },
            row[c] ?? null,
          ),
        ),
      ),
    );
  });
  return createElement('div', { className: p.className as string | undefined, style: outer }, children);
}

/** A measurable GFM-table primitive with aligned, content-proportional columns. */
export const TableBlock = markPrimitive(
  renderTableBlock as <C extends string = string>(props: TableBlockProps<C>) => ReactElement,
  {
    name: 'TableBlock',
    measure: (props, ctx) => measureTable(props as unknown as TableBlockProps, ctx),
    naturalWidth: (props, ctx) => {
      const ratios = columnRatios(props as unknown as TableBlockProps, ctx);
      if (ratios == null) return null;
      return ratios.reduce((a, b) => a + b, 0);
    },
  },
);
