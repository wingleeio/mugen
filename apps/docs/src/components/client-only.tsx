import { useEffect, useState, type ReactNode } from 'react';

// The fonts the live demos measure with. mugen computes heights against the
// canvas/font engine, so every one of these must be *loaded* before a demo
// mounts — a height measured against the fallback font is wrong once the real
// font swaps in, and the rows overlap. One representative shorthand per face is
// enough (size doesn't change which face loads). Inter's static weights cover
// 400/500/600 and round 650/700 to the nearest; the Geist families are variable.
const DEMO_FONTS = [
  '400 16px Inter',
  '500 16px Inter',
  '600 16px Inter',
  '700 16px Inter',
  'italic 400 16px Inter',
  "400 16px 'Geist Mono Variable'",
  "500 16px 'Geist Mono Variable'",
  "700 16px 'Geist Mono Variable'",
];

/**
 * Render `children()` only after mount **and** after the demo fonts have loaded.
 *
 * Beyond gating on SSR/prerender (mugen needs the browser's font engine), this
 * waits for the actual webfonts. Production serves them before the demo mounts,
 * so it looks right; the dev server loads them lazily, so without this the
 * recipes measure against the fallback font and overlap — and the after-the-fact
 * re-measure isn't reliable on iOS Safari. We force-load each face with
 * `document.fonts.load()` (more dependable than `document.fonts.ready`, which can
 * resolve before a lazily-requested face is usable), then reveal on the next
 * frame so the canvas is warm. A safety timeout avoids a stuck preview.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: () => ReactNode;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      // One frame so a font that just loaded is painted/warm before we measure.
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.load) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }
    // Last-resort net for a genuinely stalled font request, set well above a
    // realistic slow load so the font loads — not the timeout — reveal the demo.
    const t = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 8000);
    void Promise.all(DEMO_FONTS.map((f) => fonts.load(f).catch(() => {})))
      .then(() => fonts.ready)
      .then(reveal);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  return <>{ready ? children() : fallback}</>;
}
