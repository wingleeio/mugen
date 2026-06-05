import { useState, type ReactNode } from 'react';
import { ClientOnly } from './client-only';
import { EXAMPLES } from '../examples';

type Tab = 'preview' | 'code';

/**
 * A docs code example with a live Preview / Code toggle. `example` keys into the
 * registry in `src/examples.tsx`. The preview runs the real mugen list
 * (client-only); the Code tab shows the pre-highlighted source.
 */
export function Showcase({
  example,
  filename,
}: {
  example: string;
  filename?: string;
}): ReactNode {
  const [tab, setTab] = useState<Tab>('preview');
  const entry = EXAMPLES[example];
  if (!entry) {
    return (
      <div className="not-prose my-6 rounded-xl border border-red-500/40 bg-red-500/5 p-4 font-mono text-sm">
        Unknown example: {example}
      </div>
    );
  }
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex items-center gap-3 border-b bg-fd-muted/40 px-3 py-2">
        <span className="font-mono text-xs text-fd-muted-foreground">
          {filename ?? `${example}.tsx`}
        </span>
        <div className="ml-auto inline-flex rounded-lg border bg-fd-background p-0.5 font-mono text-xs">
          <Seg active={tab === 'preview'} onClick={() => setTab('preview')}>
            Preview
          </Seg>
          <Seg active={tab === 'code'} onClick={() => setTab('code')}>
            Code
          </Seg>
        </div>
      </div>
      <div style={{ height: entry.height }}>
        {tab === 'preview' ? (
          <ClientOnly
            fallback={
              <div className="flex h-full items-center justify-center font-mono text-xs text-fd-muted-foreground">
                loading preview…
              </div>
            }
          >
            {() => entry.preview()}
          </ClientOnly>
        ) : (
          <div
            className="mu-code mu-scroll h-full overflow-auto text-[12.5px] [&>.shiki]:min-h-full"
            dangerouslySetInnerHTML={{ __html: entry.codeHtml }}
          />
        )}
      </div>
    </div>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md px-2.5 py-1 font-medium transition-colors ' +
        (active ? 'bg-fd-primary text-fd-primary-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground')
      }
    >
      {children}
    </button>
  );
}
