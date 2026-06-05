import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import type { MDXComponents } from 'mdx/types';
import { Showcase } from './showcase';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // Twoslash hover popovers
    Popup,
    PopupContent,
    PopupTrigger,
    // Live Preview/Code examples
    Showcase,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
