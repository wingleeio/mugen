import { createElement, type ReactNode } from 'react';
import {
  renderMarkdown as renderMarkdownCore,
  type RenderMarkdownOptions as CoreRenderMarkdownOptions,
  type MarkdownPrimitives,
} from '@wingleeio/mugen-markdown/native-core';
import { VStack } from '@wingleeio/mugen-native';
import { RichTextForDispatcher } from './primitives/rich-text';
import { FadeMarkdown } from './primitives/fade';
import { defaultNativeComponents } from './components';

// The dispatcher's two hardcoded primitives, swapped for the native ones. A
// single frozen module-level object: the block memo caches key on its identity.
const NATIVE_PRIMITIVES: MarkdownPrimitives = Object.freeze({
  Stack: VStack as MarkdownPrimitives['Stack'],
  RichText: RichTextForDispatcher as MarkdownPrimitives['RichText'],
});

export type RenderMarkdownOptions = Omit<CoreRenderMarkdownOptions, 'primitives'>;

// Merge user components under the native defaults once per input identity —
// the block memo caches key on the merged object, so a fresh object per render
// would defeat streaming memoization.
const componentsCache = new WeakMap<object, object>();
function withNativeDefaults(
  components: CoreRenderMarkdownOptions['components'],
): CoreRenderMarkdownOptions['components'] {
  if (components == null) return defaultNativeComponents;
  let merged = componentsCache.get(components);
  if (merged === undefined) {
    merged = { ...defaultNativeComponents, ...components };
    componentsCache.set(components, merged);
  }
  return merged as CoreRenderMarkdownOptions['components'];
}

/**
 * Parse `source` and render it into a tree of **native** mugen primitives —
 * the exact web pipeline (incremark parsing, theme resolution, inline runs,
 * block memoization) with native `Stack`/`RichText` injected and the native
 * component defaults underneath the user's overrides.
 */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): ReactNode {
  return renderMarkdownCore(source, {
    ...options,
    components: withNativeDefaults(options.components),
    primitives: NATIVE_PRIMITIVES,
  });
}

export interface MarkdownProps extends RenderMarkdownOptions {
  /** The markdown source to render. */
  source: string;
  /**
   * Fade newly-streamed content in. Layout is untouched (heights stay exact);
   * new lines animate opacity as they appear. Coarser than the web's
   * per-character veil — see the native `FadeMarkdown` for the contract.
   */
  fade?: boolean;
}

/**
 * Render markdown as a tree of native mugen primitives — pure and hook-free at
 * this level, so it can be returned straight from a `<MugenVList>` `render`
 * and measured by the walker, exactly like the web `<Markdown>`.
 */
export function Markdown(props: MarkdownProps): ReactNode {
  const content = renderMarkdown(props.source, props);
  if (props.fade && content != null) {
    return createElement(FadeMarkdown, null, content);
  }
  return content;
}
Markdown.displayName = 'Markdown';
