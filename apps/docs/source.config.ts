import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { rehypeCodeDefaultOptions, remarkNpm } from 'fumadocs-core/mdx-plugins';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { createFileSystemTypesCache } from 'fumadocs-twoslash/cache-fs';
import * as ts from 'typescript';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    // Turn a ```package-install block into npm/pnpm/yarn/bun tabs. `persist`
    // remembers the reader's package manager across pages.
    remarkPlugins: (v) => [...v, [remarkNpm, { persist: { id: 'package-manager' } }]],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          typesCache: createFileSystemTypesCache({ dir: '.source/twoslash-cache' }),
          twoslashOptions: {
            compilerOptions: {
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              moduleResolution: ts.ModuleResolutionKind.Bundler,
              strict: true,
              skipLibCheck: true,
              noUnusedLocals: false,
            },
          },
        }),
      ],
    },
  },
});
