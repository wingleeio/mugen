import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  markPrimitive,
  naturalWidthOf,
  type MeasurableStyle,
  type MeasureContext,
  type SafeClassName,
} from '@wingleeio/mugen/native-core';

/**
 * A GFM table that *looks* like a table, stays exactly measurable, and never
 * crushes its columns on a narrow viewport.
 *
 * Each column has a **max-content width** (the width its widest cell wants) and
 * a **minimum width** (`min(max-content, minColumnWidth)` — a naturally short
 * column keeps its content width; a long one may wrap, but only down to the
 * floor). Widths are then resolved exactly the way CSS flexbox resolves
 * `flex-grow: max-content; flex-basis: 0` cells with a `min-width` floor:
 * distribute the available width in proportion to each column's max-content
 * size, pin any column that would fall below its floor, and re-share the
 * remainder among the rest. When every column is pinned — the viewport is
 * narrower than the sum of the minimums — the row overflows and the table
 * scrolls horizontally inside a clipped viewport rather than wrapping each
 * column to a sliver. `resolveColumnWidths` mirrors that algorithm so the
 * analytic height matches the painted flex layout at any width.
 *
 * The design is frameless — a flat "hairline" table: horizontal row rules under
 * the header and between rows are the only chrome, with no outer box or header
 * fill. Those rules are real `divider`-px elements (counted in the height); an
 * optional corner `radius` is pure overflow clipping. The horizontal scroller
 * hides its scrollbar (`scrollbar-width: none`) so the scroll affordance never
 * adds height the measure can't see, on classic-scrollbar platforms included.
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
  /**
   * Reasonable minimum rendered column width in px (padding included). Columns
   * whose content is naturally narrower keep their content width; wider columns
   * wrap down to this floor, and once the minimums no longer fit the row the
   * table scrolls horizontally. Defaults to {@link DEFAULT_MIN_COLUMN_WIDTH}.
   */
  minColumnWidth?: number;
  style?: MeasurableStyle;
  className?: SafeClassName<C>;
}

/**
 * Floor for a column's max-content share, so a short column ("1k") beside a
 * prose column keeps a readable width instead of collapsing to nothing.
 */
const MIN_COLUMN_CONTENT = 48;

/** Fallback minimum column width when a caller omits `minColumnWidth`. */
export const DEFAULT_MIN_COLUMN_WIDTH = 96;

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
 * Per-column max-content width (plus padding), or `null` when some cell's
 * natural width is unknowable (→ equal, floorless columns).
 */
function columnNaturals(p: TableBlockProps, ctx: MeasureContext): number[] | null {
  const cols = columnCount(p.rows);
  const naturals = new Array<number>(cols).fill(MIN_COLUMN_CONTENT);
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
      if (w > naturals[c]!) naturals[c] = w;
    }
  }
  return naturals.map((r) => r + 2 * p.cellPadding);
}

/** The shared per-column geometry used by both the measure and the renders. */
export interface TableColumns {
  /** Per-column max-content width, padding included. */
  naturals: number[];
  /** Per-column minimum width, padding included = `min(natural, minColumnWidth)`. */
  minimums: number[];
  /** Σ minimums — the width below which the table stops shrinking and scrolls. */
  minTableWidth: number;
}

/**
 * Resolve the shared column geometry (max-content widths + per-column floors).
 * Falls back to equal, floorless columns when a cell's natural width is
 * unknowable (SSR / no metrics) — the same fallback the old renderer used.
 */
export function tableColumns(p: TableBlockProps, ctx: MeasureContext): TableColumns {
  const cols = columnCount(p.rows);
  const naturals = columnNaturals(p, ctx);
  if (naturals == null) {
    const equal = new Array<number>(cols).fill(1);
    return { naturals: equal, minimums: new Array<number>(cols).fill(0), minTableWidth: 0 };
  }
  const minColumnWidth = p.minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  const minimums = naturals.map((n) => Math.min(n, minColumnWidth));
  const minTableWidth = minimums.reduce((a, b) => a + b, 0);
  return { naturals, minimums, minTableWidth };
}

/**
 * Resolve the final per-column pixel widths at an available width, replicating
 * CSS flexbox's grow-with-`min-width` resolution for cells styled
 * `flex-grow: natural; flex-basis: 0; min-width: minimum`:
 *
 *  1. distribute the width across the unfrozen columns in proportion to their
 *     max-content size,
 *  2. pin (freeze) every column whose share is below its minimum,
 *  3. subtract the pinned minimums and repeat with the rest.
 *
 * When no column violates its floor this is plain content-proportional sizing
 * (the old behaviour, filling the row). When some do, the narrow columns hold
 * their readable minimum and the wide ones share what's left. When *every*
 * column is pinned — the viewport is narrower than Σ minimums — the widths sum
 * to `minTableWidth`, exceeding the viewport, and the table scrolls. The result
 * always sums to `max(availWidth, minTableWidth)`, which is the table's painted
 * width.
 */
export function resolveColumnWidths(cols: TableColumns, availWidth: number): number[] {
  const { naturals, minimums, minTableWidth } = cols;
  const n = naturals.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;
  const frozen = new Array<boolean>(n).fill(false);
  // The table never renders narrower than its column minimums; below that width
  // every column sits at its floor and the row overflows (scrolls).
  let free = Math.max(availWidth, minTableWidth);
  // At most `n` freeze passes (each pins ≥ 1 column); the last assigns the rest.
  for (let pass = 0; pass <= n; pass++) {
    let growSum = 0;
    for (let c = 0; c < n; c++) if (!frozen[c]) growSum += naturals[c]!;
    if (growSum <= 0) break;
    const violators: number[] = [];
    for (let c = 0; c < n; c++) {
      if (frozen[c]) continue;
      if ((free * naturals[c]!) / growSum < minimums[c]! - 1e-6) violators.push(c);
    }
    if (violators.length === 0) {
      for (let c = 0; c < n; c++) if (!frozen[c]) out[c] = (free * naturals[c]!) / growSum;
      break;
    }
    for (const c of violators) {
      out[c] = minimums[c]!;
      frozen[c] = true;
      free -= minimums[c]!;
    }
  }
  // Any column left unassigned (grow factors all froze out) sits at its floor.
  for (let c = 0; c < n; c++) if (!frozen[c] && out[c] === 0) out[c] = minimums[c]!;
  return out;
}

function measureTable(p: TableBlockProps, ctx: MeasureContext): number {
  const rows = p.rows;
  const cols = columnCount(rows);
  if (rows.length === 0 || cols === 0) return 0;
  const widths = resolveColumnWidths(tableColumns(p, ctx), ctx.width);
  let height = (rows.length - 1) * p.divider;
  for (const row of rows) {
    let rowH = 2 * p.cellPadding;
    for (let c = 0; c < cols; c++) {
      const cell = row[c];
      if (cell == null) continue;
      const inner = Math.max(0, widths[c]! - 2 * p.cellPadding);
      rowH = Math.max(rowH, ctx.measure(cell, inner) + 2 * p.cellPadding);
    }
    height += rowH;
  }
  return height;
}

function renderTableBlock(p: TableBlockProps): ReactElement {
  const cols = columnCount(p.rows);
  const geo = tableColumns(p, STUB_CTX);
  // The scroller is the *viewport*: it scrolls horizontally when the column
  // minimums overflow it. `min-width: 0` lets it shrink inside the flex column
  // of blocks; the hidden scrollbar keeps the scroll affordance height-neutral.
  // The table is frameless (flat hairline design) — row rules are the only
  // chrome; an optional `radius` still clips the corners for a framed variant.
  const scroller: CSSProperties = {
    margin: 0,
    minWidth: 0,
    maxWidth: '100%',
    // `auto`/`hidden` (both non-visible) makes this a scroll container that
    // clips its content — including scrolled overflow — to the (optional) radius.
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    ...(p.radius > 0 ? { borderRadius: `${p.radius}px` } : null),
    ...(p.style as CSSProperties | undefined),
  };
  // The table content fills the viewport but never shrinks below the column
  // minimums — that floor is exactly what makes the scroller scroll.
  const inner: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minWidth: `${geo.minTableWidth}px`,
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
                // Grow ∝ max-content (the old proportional sizing), floored by
                // `min-width` — the browser then resolves the very widths
                // `resolveColumnWidths` models, so measure and paint agree.
                flex: `${geo.naturals[c]} ${geo.naturals[c]} 0px`,
                minWidth: `${geo.minimums[c]}px`,
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
  return createElement(
    'div',
    { className: p.className as string | undefined, style: scroller },
    createElement('div', { style: inner }, children),
  );
}

/** A measurable GFM-table primitive with aligned, floored, content-proportional columns. */
export const TableBlock = markPrimitive(
  renderTableBlock as <C extends string = string>(props: TableBlockProps<C>) => ReactElement,
  {
    name: 'TableBlock',
    measure: (props, ctx) => measureTable(props as unknown as TableBlockProps, ctx),
    naturalWidth: (props, ctx) => {
      const naturals = columnNaturals(props as unknown as TableBlockProps, ctx);
      if (naturals == null) return null;
      return naturals.reduce((a, b) => a + b, 0);
    },
  },
);
