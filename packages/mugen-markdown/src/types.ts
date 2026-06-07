import type { CSSProperties, ReactNode } from 'react';
import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Image,
  List,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
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
 * The overridable block-level components, keyed by mdast node type and typed to
 * the matching node. Inline marks (bold, italic, code, links) are styled through
 * the {@link MarkdownTheme} rather than as components, because inline content
 * must collapse into a single wrapping flow to be measured exactly.
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
}

export type ResolvedMarkdownComponents = Required<MarkdownComponents>;

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
