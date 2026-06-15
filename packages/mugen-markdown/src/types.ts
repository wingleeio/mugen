import type { CSSProperties, ReactNode } from 'react';
import type { Font } from '@wingleeio/mugen';
import type {
  Blockquote,
  Code,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  Paragraph,
  PhrasingContent,
  RootContent,
  Strong,
  Table,
  Text as MdastText,
  ThematicBreak,
} from 'mdast';
import type { MarkdownTheme } from './theme';
import type { InlineFormat } from './inline';
import type { RichTextRun } from './primitives/rich-text';

/** Options for building a body/heading inline-text (`RichText`) element. */
export interface InlineTextOptions {
  /** Font size in px (defaults to the theme body size). */
  size?: number;
  /** Font weight (defaults to 400). */
  weight?: number;
  /** Line height in px (defaults to the theme body line height). */
  lineHeight?: number;
  color?: string;
  align?: CSSProperties['textAlign'];
}

/**
 * The context threaded to every markdown component. It carries the resolved
 * theme and the helpers a component needs to recurse — all of which return
 * **mugen primitives**, so whatever a component builds with them stays
 * measurable by mugen's tree walker.
 */
export interface MarkdownRenderContext {
  /** The fully-resolved theme. */
  readonly theme: MarkdownTheme;
  /** The resolved component set (defaults merged with user overrides). */
  readonly components: ResolvedMarkdownComponents;
  /** Render a list of block nodes as a vertically-stacked subtree (gap defaults to `theme.blockGap`). */
  renderBlocks(nodes: readonly RootContent[], gap?: number): ReactNode;
  /** Render a single block node, dispatching to its component. */
  renderBlock(node: RootContent, key?: string | number): ReactNode;
  /** The default inner rendering for a node (inline `RichText`, or rendered child blocks). */
  renderChildren(node: RootContent): ReactNode;
  /** Flatten phrasing content into styled `RichText` runs at an optional base format. */
  inlineRuns(nodes: readonly PhrasingContent[], base?: Partial<InlineFormat>): RichTextRun[];
  /** Build a `RichText` element from phrasing content (the inline pipeline). */
  inlineText(nodes: readonly PhrasingContent[], opts?: InlineTextOptions): ReactNode;
  /**
   * Memoize a rendered element by its `node`'s content, so streaming re-renders
   * reuse it (React then bails out). `variant` distinguishes renderings of the
   * same node that differ by sibling context — e.g. a list item's index/marker
   * or a table cell's column. Use it in custom `list`/`table` components so their
   * already-finished items/cells don't re-render while a later one streams in.
   */
  memo(node: object, variant: string, build: () => ReactNode): ReactNode;
}

/**
 * Props every markdown component receives. `node` is the typed mdast node,
 * `children` is what the default component would render inside (so an override
 * can wrap it), and `ctx` exposes the recursion + theme helpers.
 */
export interface MarkdownComponentProps<N> {
  node: N;
  children: ReactNode;
  ctx: MarkdownRenderContext;
}

/**
 * A markdown component. It must return mugen primitives (or hook-free
 * compositions of them) so mugen's walker can measure the row — use the
 * primitives re-exported from this package and the `ctx` helpers.
 */
export type MarkdownComponent<N> = (props: MarkdownComponentProps<N>) => ReactNode;

/**
 * The context passed to an inline override. It carries the active inline format
 * (so an override can match the surrounding type) and the helpers to build runs
 * that stay exactly measurable.
 */
export interface InlineRenderContext {
  readonly theme: MarkdownTheme;
  /** The composed inline format at this node (family, size, weight, colour…). */
  readonly fmt: InlineFormat;
  /** Compose a measurable `Font` from the current format plus overrides. */
  font(overrides?: Partial<InlineFormat>): Font;
  /**
   * Measure a string's rendered advance in px for a font — to size an inline
   * box. A text pill reserves `measure(label, font) + horizontalPadding`.
   */
  measure(text: string, font: Font): number;
  /** Default-flatten phrasing children into runs, to compose with your own. */
  runs(nodes: readonly PhrasingContent[], fmtOverrides?: Partial<InlineFormat>): RichTextRun[];
}

/**
 * An inline-node override: given the mdast node and the inline context, return
 * the runs it should flatten to — styled text, an inline box (`{ advance,
 * content }`), or a mix — or `null` to fall back to the default styling.
 */
export type InlineComponent<N> = (node: N, ctx: InlineRenderContext) => RichTextRun[] | null;

/**
 * Inline-node overrides, keyed by mdast inline type. The index signature admits
 * custom inline tokens (from a remark plugin) beyond the named ones.
 */
export interface InlineComponents {
  text?: InlineComponent<MdastText>;
  strong?: InlineComponent<Strong>;
  emphasis?: InlineComponent<Emphasis>;
  delete?: InlineComponent<Delete>;
  inlineCode?: InlineComponent<InlineCode>;
  link?: InlineComponent<Link>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [type: string]: InlineComponent<any> | undefined;
}

/**
 * The overridable components. Block-level marks are keyed by mdast node type and
 * typed to the matching node. Inline marks (bold, italic, code, links) are
 * styled through the {@link MarkdownTheme} by default, but `inline` lets you
 * override how an inline node flattens into runs — including a measured inline
 * box (`{ advance, content }`), the inline twin of mugen's `Escape`.
 */
export interface MarkdownComponents {
  paragraph?: MarkdownComponent<Paragraph>;
  heading?: MarkdownComponent<Heading>;
  thematicBreak?: MarkdownComponent<ThematicBreak>;
  blockquote?: MarkdownComponent<Blockquote>;
  list?: MarkdownComponent<List>;
  code?: MarkdownComponent<Code>;
  table?: MarkdownComponent<Table>;
  image?: MarkdownComponent<Image>;
  html?: MarkdownComponent<Html>;
  /** Inline-node overrides (see {@link InlineComponents}). */
  inline?: InlineComponents;
}

/** Block components resolve to defaults; `inline` stays optional. */
export type ResolvedMarkdownComponents = Required<Omit<MarkdownComponents, 'inline'>> & {
  inline?: InlineComponents;
};

/**
 * Identity helper for authoring a typed component set with full inference and
 * `node` narrowing per key:
 *
 * ```tsx
 * const components = defineMarkdownComponents({
 *   heading: ({ node, children }) => // node is Heading, node.depth is 1..6
 *     <VStack>{children}</VStack>,
 * });
 * ```
 */
export function defineMarkdownComponents(components: MarkdownComponents): MarkdownComponents {
  return components;
}
