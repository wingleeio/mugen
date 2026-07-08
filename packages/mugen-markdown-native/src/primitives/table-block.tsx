import { useContext, type ReactElement, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  getPrimitiveDef,
  markPrimitive,
  measureNode,
  TextDefaultsContext,
  type MeasureContext,
} from '@wingleeio/mugen/native-core';
import {
  TableBlock as WebTableBlock,
  tableColumns,
  resolveColumnWidths,
} from '@wingleeio/mugen-markdown/native-core';
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
  /**
   * Reasonable minimum rendered column width in px (padding included). Wider
   * columns wrap down to this floor; once the minimums no longer fit the row the
   * table scrolls horizontally. Defaults inside the shared column math.
   */
  minColumnWidth?: number;
}

const webDef = getPrimitiveDef(WebTableBlock)!;

// Same stub context as the web renderer — the RichText cells' `naturalWidth`
// ignores the context, so the column math comes out identical to the measure.
const STUB_CTX: MeasureContext = { defaults: {}, width: 0, measure: () => 0 };

/**
 * The native render half: rows of explicit pixel-width cells. Column widths come
 * from the shared `resolveColumnWidths` — the exact arithmetic the measure runs
 * — so each cell's width (and the `WidthContext` the RichText inside wraps at)
 * matches the analytic height at any viewport.
 *
 * When the columns' minimums fit the viewport the table renders inline (frameless
 * rows of hairline-separated cells). When they don't, the rows go inside a
 * horizontal `ScrollView` sized to the shared measured height (React Native won't
 * derive a horizontal scroller's cross-axis height on its own), and the content
 * scrolls — the native analogue of the web's clipped, scrollbar-hidden overflow.
 */
function TableBlockComponent(props: TableBlockProps): ReactElement | null {
  const width = useContext(WidthContext);
  const defaults = useContext(TextDefaultsContext);

  const colWidths = resolveColumnWidths(tableColumns(props, STUB_CTX), width);
  const cols = colWidths.length;
  if (props.rows.length === 0 || cols === 0) return null;
  // `resolveColumnWidths` sums to `max(width, minTableWidth)`, so this exceeds
  // the viewport exactly when the column minimums don't fit.
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const overflow = tableWidth > width + 0.5;

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

  // Frameless "flat hairline" design: the row rules (Views between rows) are the
  // only chrome — no outer border. An optional `radius` still clips the corners
  // for a framed variant.
  const clip =
    props.radius > 0 ? { borderRadius: props.radius, overflow: 'hidden' as const } : null;

  if (!overflow) {
    // Fits: content-driven height, identical to the pre-overflow renderer.
    return <View style={clip ?? undefined}>{children}</View>;
  }

  // Overflow: the ScrollView needs an explicit cross-axis height. Reuse the
  // shared measure (the very height the list positioned this row at) so the
  // scroller and the row slot agree to the pixel.
  const ctx: MeasureContext = {
    width,
    defaults,
    measure: (node, w) => measureNode(node, w, defaults),
  };
  const height = webDef.measure(props as unknown as Record<string, unknown>, ctx);

  return (
    <View style={{ width, height, ...clip }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height }}>
        <View style={{ width: tableWidth }}>{children}</View>
      </ScrollView>
    </View>
  );
}
TableBlockComponent.displayName = 'TableBlock';

/** Measured exactly like the web `TableBlock` (shared column + row-height math). */
export const TableBlock = markPrimitive(
  TableBlockComponent as (props: TableBlockProps) => ReactElement | null,
  {
    name: 'TableBlock',
    measure: webDef.measure,
    naturalWidth: webDef.naturalWidth,
  },
);
