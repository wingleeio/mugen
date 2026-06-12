import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import * as React from 'react';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';

// react-scan in dev only: render highlighting + the FPS meter in its toolbar.
// Client-only dynamic import so the SSR pass and production builds never see it.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  void import('react-scan').then(({ scan }) => scan({ enabled: true }));
}

export const Route = createRootRoute({
  head: () => {
    const title = 'mugen — virtualized React lists with analytic row heights';
    const description =
      'Row heights are computed from text, font, and width — never measured from the DOM. ' +
      'Exact heights for never-mounted rows, zero layout shift, pixel-exact deep links, ' +
      'and smooth stick-to-bottom streaming at a million rows.';
    const ogImage = 'https://mugen.winglee.dev/og.png';
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://mugen.winglee.dev' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: ogImage },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
      ],
      links: [{ rel: 'stylesheet', href: appCss }],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        {/* The drafting-table look is designed dark-first; light stays available. */}
        <RootProvider theme={{ defaultTheme: 'dark' }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
