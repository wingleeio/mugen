import { createElement, type ReactNode } from 'react';
import { renderMarkdown, type RenderMarkdownOptions } from './render';
import { FadeMarkdown } from './primitives/fade';

export interface MarkdownProps extends RenderMarkdownOptions {
  /** The markdown source to render. */
  source: string;
  /**
   * Fade just-arrived text in as the source streams. The DOM still commits and
   * lays out instantly (heights stay exact); a veil over new characters
   * dissolves, which reads as a fade-in. Leaving it on for a settled block is
   * free. Honours `prefers-reduced-motion`.
   */
  fade?: boolean;
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
  const content = renderMarkdown(props.source, props);
  // Wrap in the fade primitive only when asked and there's something to show.
  // The primitive measures the content exactly (the veil canvas is out of flow),
  // so heights are unchanged whether `fade` is on or off.
  if (props.fade && content != null) {
    return createElement(FadeMarkdown, null, content);
  }
  return content;
}
Markdown.displayName = 'Markdown';
