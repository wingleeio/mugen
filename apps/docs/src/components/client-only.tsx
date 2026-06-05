import { useEffect, useState, type ReactNode } from 'react';

/**
 * Render `children()` only after mount. mugen measures with the canvas/font
 * engine, which only exists in the browser, so the live demo must not run during
 * SSR / prerender.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: () => ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children() : fallback}</>;
}
