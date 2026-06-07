import type { ReactNode } from 'react';
import { renderMarkdown, type RenderMarkdownOptions } from './render';

export interface MarkdownProps extends RenderMarkdownOptions {
  /** The markdown source to render. */
  source: string;
}

/**
 * Render markdown as a tree of mugen primitives.
 *
 * `<Markdown>` is a **pure, hook-free** component: it parses `source` with
 * incremark and maps the AST to mugen primitives, producing the identical tree
 * in mugen's measure walk and in React's render. Drop it straight into a
 * `<MugenVList>` `render` and every row — on- or off-screen — gets an exact,
 * analytic height.
 *
 * ```tsx
 * <MugenVList
 *   instance={list}
 *   getKey={(m) => m.id}
 *   render={(m) => <Markdown source={m.body} />}
 * />
 * ```
 *
 * Extend it with typed, per-node `components` (built from the same primitives)
 * and a deep-partial `theme`.
 */
export function Markdown(props: MarkdownProps): ReactNode {
  return renderMarkdown(props.source, props);
}
Markdown.displayName = 'Markdown';
