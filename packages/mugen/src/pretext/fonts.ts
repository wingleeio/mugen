import { clearTextCache } from './measure';

/**
 * Font-load coordination. Web fonts load asynchronously; any height computed
 * with a fallback font is wrong once the real font swaps in. We bump a global
 * "font epoch" when fonts settle, drop the prepare cache, and notify the engine
 * so it can re-walk affected rows.
 */

let epoch = 0;
const listeners = new Set<() => void>();
let watching = false;

/** Monotonically increasing counter; changes whenever fonts settle. */
export function fontEpoch(): number {
  return epoch;
}

/** Subscribe to font-settle events. Returns an unsubscribe fn. */
export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bump the epoch, clear the cache, and notify subscribers. Exposed for tests. */
export function notifyFontsChanged(): void {
  epoch++;
  clearTextCache();
  for (const listener of [...listeners]) listener();
}

/**
 * Begin watching `document.fonts` (idempotent). On `fonts.ready` and on each
 * `loadingdone`, invalidate cached measurements. Accepts an explicit
 * `FontFaceSet` for testing / non-DOM hosts. Returns a teardown fn.
 */
export function watchFonts(fonts?: FontFaceSet): () => void {
  const target = fonts ?? (typeof document !== 'undefined' ? document.fonts : undefined);
  if (!target || watching) return () => {};
  watching = true;

  let active = true;
  const onChange = () => {
    if (active) notifyFontsChanged();
  };

  // `ready` resolves once after the initial font load settles.
  void target.ready?.then(onChange);
  // `loadingdone` fires for later loads (e.g. a font referenced by new content).
  target.addEventListener?.('loadingdone', onChange);

  return () => {
    active = false;
    target.removeEventListener?.('loadingdone', onChange);
    watching = false;
  };
}
