import { useEffect, useRef, type ReactElement } from 'react';

/**
 * Canvas-overlay fade-in for streaming markdown — the same trick as the code
 * highlighter, pointed at motion instead of colour. The DOM text commits and
 * lays out instantly (so heights, selection, and stick-to-bottom stay honest);
 * this overlay paints a background-coloured veil over just-arrived characters
 * and dissolves it, which *reads* as the text fading in. Nothing about the row
 * ever animates — layout is done the moment the text lands.
 *
 * The veil's lifetime adapts to the stream: an exponential moving average of
 * chunk inter-arrival times sets the fade duration (fast words → fast fade),
 * and a backlog boost accelerates further if veils start stacking up — so the
 * animation can never fall behind the actual text.
 *
 * Geometry is recomputed every frame from DOM Ranges over the appended text,
 * so the veils track the content as stick-to-bottom scrolls it. The veil
 * colour is resolved *per text node* by compositing the ancestor background
 * layers (page → code-block tint → inline-code chip …) down to an opaque
 * colour, so text fades correctly over any surface, code blocks included.
 */

/** Marker class the streaming row puts on its markdown container. */
export const STREAM_FADE_CLASS = 'mu-stream-fade';

interface Veil {
  /** Character range into the container's `textContent`. */
  start: number;
  end: number;
  /** Birth time (performance.now). */
  t0: number;
}

const EMA_SEED_MS = 160;
const MIN_FADE_MS = 120;
const MAX_FADE_MS = 400;
/** Re-check for a streaming container at this cadence while idle. */
const IDLE_POLL_MS = 300;
const MAX_VEILS = 32;

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

// Streamed markdown never emits a <button>, so any button inside the container
// is interactive chrome (e.g. a code block's copy button). Its text must be
// excluded from the veil's accounting: it isn't streamed content, and a label
// flip ("Copy" → "Copied") sits *before* later content in DOM order, so counting
// it would make `commonPrefixLength` diverge at the button and re-veil — i.e.
// flash — every block after it. Both the change-detection text and the geometry
// walk skip these nodes, so their character offsets stay aligned.
function inChrome(node: Node, container: Element): boolean {
  for (let p = node.parentElement; p != null && p !== container; p = p.parentElement) {
    if (p.tagName === 'BUTTON') return true;
  }
  return false;
}

function contentTextFilter(container: Element): NodeFilter {
  return {
    acceptNode: (n) => (inChrome(n, container) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  };
}

/** `container.textContent`, minus interactive chrome (see {@link inChrome}). */
function contentText(container: Element): string {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, contentTextFilter(container));
  let s = '';
  for (let n = walker.nextNode(); n != null; n = walker.nextNode()) s += (n as Text).data;
  return s;
}

// 1×1 scratch canvas used to composite background layers. The canvas accepts
// any CSS colour (`oklab(...)`, `color-mix(...)` results, wide-gamut) as a
// fillStyle, so stacking fills and reading the pixel back gives the exact
// composited colour without ever parsing colour strings — fillStyle *getters*
// serialize modern colours as `oklab(...)`, which made string parsing fragile.
let scratch: CanvasRenderingContext2D | null | undefined;
function scratchCtx(): CanvasRenderingContext2D | null {
  if (scratch === undefined) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    scratch = c.getContext('2d', { willReadFrequently: true });
  }
  return scratch;
}

/**
 * The effective opaque colour behind `el`: every ancestor's backgroundColor
 * layer composited root→leaf. A code block's translucent tint over the page
 * background resolves to the actual colour the text sits on.
 */
function effectiveBackground(el: Element, cache: Map<Element, string>): string {
  const cached = cache.get(el);
  if (cached !== undefined) return cached;
  const layers: string[] = [];
  for (let cur: Element | null = el; cur != null; cur = cur.parentElement) {
    const bg = getComputedStyle(cur).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') layers.push(bg);
  }
  const s = scratchCtx();
  if (s == null) return '#808080';
  s.globalAlpha = 1;
  s.fillStyle = '#ffffff'; // base when nothing in the chain is opaque
  s.fillRect(0, 0, 1, 1);
  for (let i = layers.length - 1; i >= 0; i--) {
    try {
      s.fillStyle = layers[i]!;
    } catch {
      continue;
    }
    s.fillRect(0, 0, 1, 1);
  }
  const d = s.getImageData(0, 0, 1, 1).data;
  const css = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
  cache.set(el, css);
  return css;
}

/**
 * Mount as a later sibling of the list, inside its `position: relative` host.
 * Finds `.mu-stream-fade` within the host and veils its appended text.
 */
export function StreamFadeOverlay(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (canvas == null || host == null || ctx == null) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    // Per-container stream state.
    let container: Element | null = null;
    let prevText = '';
    let veils: Veil[] = [];
    let ema = EMA_SEED_MS;
    let lastAppend = 0;

    const clearCanvas = (): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const frame = (): void => {
      if (stopped) return;

      // The marked container while streaming; afterwards, keep tracking the
      // same element (if still mounted) so in-flight veils finish dissolving.
      const marked = host.querySelector(`.${STREAM_FADE_CLASS}`);
      const tracked =
        marked ?? (container != null && container.isConnected && veils.length > 0 ? container : null);
      if (tracked !== container) {
        container = tracked;
        prevText = container != null ? contentText(container) : '';
        veils = [];
        ema = EMA_SEED_MS;
        lastAppend = 0;
      }

      if (container == null) {
        clearCanvas();
        idle = setTimeout(() => {
          idle = null;
          frame();
        }, IDLE_POLL_MS);
        return;
      }

      const now = performance.now();
      const text = contentText(container);
      if (text !== prevText) {
        // Streaming mostly appends, but inline markdown can rewrite the tail
        // ("**bo" → bold "bo"): re-veil from the common prefix and truncate
        // veils that pointed past it.
        const prefix = commonPrefixLength(prevText, text);
        veils = veils
          .map((v) => ({ ...v, start: Math.min(v.start, prefix), end: Math.min(v.end, prefix) }))
          .filter((v) => v.end > v.start);
        if (text.length > prefix) {
          if (lastAppend > 0) ema = ema * 0.7 + Math.min(now - lastAppend, 1000) * 0.3;
          lastAppend = now;
          veils.push({ start: prefix, end: text.length, t0: now });
          if (veils.length > MAX_VEILS) veils.splice(0, veils.length - MAX_VEILS);
        }
        prevText = text;
      }

      // Adaptive pace: track the chunk cadence, accelerate under backlog.
      const duration = Math.min(MAX_FADE_MS, Math.max(MIN_FADE_MS, ema * 3));
      const boost = 1 + 0.3 * Math.max(0, veils.length - 2);
      veils = veils.filter((v) => (now - v.t0) * boost < duration);

      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (veils.length > 0) {
        const origin = canvas.getBoundingClientRect();
        const bgCache = new Map<Element, string>();
        // One path per (veil, background): rects within a group fill once, so
        // the translucent veil doesn't compound where fragments overlap.
        const groups = new Map<string, { alpha: number; bg: string; path: Path2D }>();
        const minStart = veils.reduce((m, v) => Math.min(m, v.start), Infinity);

        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          contentTextFilter(container),
        );
        let base = 0;
        let node = walker.nextNode() as Text | null;
        while (node != null) {
          const len = node.data.length;
          if (len > 0 && base + len > minStart) {
            for (let vi = 0; vi < veils.length; vi++) {
              const v = veils[vi]!;
              const s = Math.max(v.start - base, 0);
              const e = Math.min(v.end - base, len);
              if (e <= s) continue;
              const parent = node.parentElement;
              if (parent == null) continue;
              const bg = effectiveBackground(parent, bgCache);
              const key = `${vi}|${bg}`;
              let group = groups.get(key);
              if (group === undefined) {
                const p = Math.min(1, ((now - v.t0) * boost) / duration);
                group = { alpha: Math.pow(1 - p, 1.6), bg, path: new Path2D() };
                groups.set(key, group);
              }
              const range = document.createRange();
              range.setStart(node, s);
              range.setEnd(node, e);
              for (const r of range.getClientRects()) {
                // Inflate by 1px so glyph antialiasing is fully covered.
                group.path.rect(
                  r.left - origin.left - 1,
                  r.top - origin.top - 1,
                  r.width + 2,
                  r.height + 2,
                );
              }
            }
          }
          base += len;
          node = walker.nextNode() as Text | null;
        }

        for (const group of groups.values()) {
          ctx.globalAlpha = group.alpha;
          ctx.fillStyle = group.bg;
          ctx.fill(group.path);
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };

    frame();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (idle != null) clearTimeout(idle);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
