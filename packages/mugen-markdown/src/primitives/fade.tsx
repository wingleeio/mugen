import {
  createElement,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  markPrimitive,
  measureChildren,
  naturalWidthOf,
  type MeasureContext,
} from '@wingleeio/mugen';

/**
 * Streaming fade-in for `<Markdown fade>`.
 *
 * The same trick the code highlighter uses, pointed at motion instead of
 * colour: the markdown DOM commits and lays out instantly (so heights,
 * selection, and stick-to-bottom stay honest), and a background-coloured veil
 * is painted over just-arrived characters and dissolved — which *reads* as the
 * text fading in. Nothing about the row ever animates; layout is done the
 * moment the text lands.
 *
 * Unlike a list-level overlay, the veil canvas lives **inside** the markdown's
 * own box (`position: absolute; inset: 0`), so it scrolls with the content and
 * needs no viewport-geometry tracking. The painter idles (no rAF) until a
 * DOM mutation arrives, so leaving `fade` on for a settled block costs nothing.
 */

const EMA_SEED_MS = 160;
const MIN_FADE_MS = 120;
const MAX_FADE_MS = 400;
const MAX_VEILS = 32;

interface Veil {
  /** Character range into the container's content text. */
  start: number;
  end: number;
  /** Birth time (performance.now). */
  t0: number;
}

// Streamed markdown never emits a <button>, so any button inside the container
// is interactive chrome (e.g. a code block's copy button). Its text is excluded
// from the veil's accounting: it isn't streamed content, and a label flip
// ("Copy" -> "Copied") sits *before* later content in DOM order, so counting it
// would shift every later character offset and re-veil — i.e. flash — every
// block after it. The length tracking and the geometry walk both skip these
// nodes, so the offsets stay aligned.
function inChrome(node: Node, container: Element): boolean {
  for (let p = node.parentElement; p != null && p !== container; p = p.parentElement) {
    if (p.tagName === 'BUTTON') return true;
  }
  return false;
}

/** Whether `el` (or an ancestor up to `container`) is interactive chrome. */
function elementInChrome(el: Element, container: Element): boolean {
  for (let p: Element | null = el; p != null && p !== container; p = p.parentElement) {
    if (p.tagName === 'BUTTON') return true;
  }
  return false;
}

function contentTextFilter(container: Element): NodeFilter {
  return {
    acceptNode: (n) => (inChrome(n, container) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  };
}

/** Chrome-free text length of `container` — a full walk; used to seed/reconcile. */
function chromeFreeLength(container: Element): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, contentTextFilter(container));
  let n = 0;
  for (let t = walker.nextNode(); t != null; t = walker.nextNode()) n += (t as Text).data.length;
  return n;
}

/**
 * Chrome-free text length of one node's subtree — used to fold a single
 * added/removed node into the running length without touching the rest of the
 * DOM. Buttons inside the node are skipped; a button node itself counts zero.
 */
function subtreeTextLength(node: Node): number {
  if (node.nodeType === 3 /* TEXT_NODE */) return (node as Text).data.length;
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return 0;
  const el = node as Element;
  if (el.tagName === 'BUTTON') return 0;
  let n = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => {
      for (let p = t.parentElement; p != null && p !== el; p = p.parentElement) {
        if (p.tagName === 'BUTTON') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let t = walker.nextNode(); t != null; t = walker.nextNode()) n += (t as Text).data.length;
  return n;
}

// 1x1 scratch canvas used to composite background layers. The canvas accepts any
// CSS colour (`oklab(...)`, `color-mix(...)` results, wide-gamut) as a fillStyle,
// so stacking fills and reading the pixel back gives the exact composited colour
// without parsing colour strings.
let scratch: CanvasRenderingContext2D | null | undefined;
function scratchCtx(): CanvasRenderingContext2D | null {
  if (scratch === undefined) {
    const c = typeof document === 'undefined' ? null : document.createElement('canvas');
    if (c == null) return (scratch = null);
    c.width = 1;
    c.height = 1;
    scratch = c.getContext('2d', { willReadFrequently: true });
  }
  return scratch;
}

/** The opaque colour behind `el`: every ancestor's backgroundColor composited. */
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
 * Paints the dissolving veil over a single content element's newly-arrived text.
 * Driven by a MutationObserver that folds each change into a running length, so
 * a streaming tick costs O(delta) — never an O(n) walk of the whole content,
 * which is what made long streams lag. A rAF loop runs only while veils are
 * alive, then stops until the next mutation, so an idle (settled) block uses no
 * frames. Only the small, recent veil region is ever measured for geometry.
 */
class FadePainter {
  private content: Element | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** Chrome-free text length, tracked incrementally from mutation records. */
  private length = 0;
  /** Net length change observed since the last frame folded it in. */
  private pendingDelta = 0;
  private veils: Veil[] = [];
  private ema = EMA_SEED_MS;
  private lastAppend = 0;
  private raf = 0;
  private running = false;
  private mo: MutationObserver | null = null;

  attach(content: Element, canvas: HTMLCanvasElement): void {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // respect reduced motion — text just appears
    }
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    this.content = content;
    this.canvas = canvas;
    this.ctx = ctx;
    // Seed from the current content so already-present text is never veiled.
    this.length = chromeFreeLength(content);
    // Track length from mutation records — appended text folds in as a delta, so
    // a streaming tick costs O(delta), never an O(n) walk of the whole content.
    this.mo = new MutationObserver((records) => this.onMutations(records));
    this.mo.observe(content, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    });
  }

  private onMutations(records: MutationRecord[]): void {
    const content = this.content;
    if (content == null) return;
    for (const rec of records) {
      if (rec.type === 'characterData') {
        const node = rec.target;
        if (inChrome(node, content)) continue;
        this.pendingDelta += (node.nodeValue?.length ?? 0) - (rec.oldValue?.length ?? 0);
      } else if (rec.type === 'childList') {
        // A mutation inside chrome (the copy button's label) changes no content.
        if (rec.target instanceof Element && elementInChrome(rec.target, content)) continue;
        for (let i = 0; i < rec.addedNodes.length; i++) {
          this.pendingDelta += subtreeTextLength(rec.addedNodes[i]!);
        }
        for (let i = 0; i < rec.removedNodes.length; i++) {
          this.pendingDelta -= subtreeTextLength(rec.removedNodes[i]!);
        }
      }
    }
    this.wake();
  }

  destroy(): void {
    this.mo?.disconnect();
    this.mo = null;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
    this.content = null;
    this.canvas = null;
    this.ctx = null;
  }

  private wake(): void {
    if (this.running || this.content == null) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    const content = this.content;
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (content == null || canvas == null || ctx == null) {
      this.running = false;
      return;
    }

    const now = performance.now();
    // Fold in the length change since last frame (no DOM walk). Appended text
    // gets a fresh veil over `[oldLength, newLength)`; a tail that shrank (inline
    // markdown collapsing, e.g. "**bo" -> bold "bo") clamps veils back.
    if (this.pendingDelta !== 0) {
      const newLength = Math.max(0, this.length + this.pendingDelta);
      this.pendingDelta = 0;
      if (newLength > this.length) {
        if (this.lastAppend > 0) this.ema = this.ema * 0.7 + Math.min(now - this.lastAppend, 1000) * 0.3;
        this.lastAppend = now;
        this.veils.push({ start: this.length, end: newLength, t0: now });
        if (this.veils.length > MAX_VEILS) this.veils.splice(0, this.veils.length - MAX_VEILS);
      } else if (newLength < this.length) {
        this.veils = this.veils
          .map((v) => ({ ...v, start: Math.min(v.start, newLength), end: Math.min(v.end, newLength) }))
          .filter((v) => v.end > v.start);
      }
      this.length = newLength;
    }

    // Adaptive pace: track the chunk cadence, accelerate under backlog.
    const duration = Math.min(MAX_FADE_MS, Math.max(MIN_FADE_MS, this.ema * 3));
    const boost = 1 + 0.3 * Math.max(0, this.veils.length - 2);
    this.veils = this.veils.filter((v) => (now - v.t0) * boost < duration);

    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const w = (content as HTMLElement).clientWidth;
    const h = (content as HTMLElement).clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.veils.length > 0) {
      const origin = canvas.getBoundingClientRect();
      const bgCache = new Map<Element, string>();
      const groups = new Map<string, { alpha: number; bg: string; path: Path2D }>();
      const minStart = this.veils.reduce((m, v) => Math.min(m, v.start), Infinity);

      // Veils only ever cover the freshly-appended tail — `[minStart, length]`,
      // a few hundred characters. So instead of walking forward from offset 0 to
      // accumulate each node's `base` (O(content length) every frame, the thing
      // that lagged long streams), position at the last chrome-free text node and
      // walk *backward*, deriving `base` from the running total. `this.length` is
      // the same coordinate system the veils use, so the offsets line up. This is
      // O(veil span) per frame — flat regardless of how long the answer gets.
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, contentTextFilter(content));
      walker.currentNode = content;
      let node = walker.lastChild() as Text | null;
      let end = this.length;
      while (node != null && end > minStart) {
        const len = node.data.length;
        const base = end - len;
        if (len > 0) {
          for (let vi = 0; vi < this.veils.length; vi++) {
            const v = this.veils[vi]!;
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
              group.path.rect(r.left - origin.left - 1, r.top - origin.top - 1, r.width + 2, r.height + 2);
            }
          }
        }
        end = base;
        node = walker.previousNode() as Text | null;
      }

      for (const group of groups.values()) {
        ctx.globalAlpha = group.alpha;
        ctx.fillStyle = group.bg;
        ctx.fill(group.path);
      }
      ctx.globalAlpha = 1;
    }

    if (this.veils.length > 0) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      // Nothing left to dissolve — idle until the next mutation. Reconcile the
      // length against the DOM here (off the hot path) so any drift from an
      // unusual mutation can't accumulate across bursts.
      this.length = chromeFreeLength(content);
      this.running = false;
      this.raf = 0;
    }
  };
}

interface FadeMarkdownProps {
  /** The rendered markdown subtree to veil. */
  children?: ReactNode;
}

function renderFadeMarkdown(props: FadeMarkdownProps): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    const canvas = canvasRef.current;
    if (content == null || canvas == null) return;
    const painter = new FadePainter();
    painter.attach(content, canvas);
    return () => painter.destroy();
  }, []);

  const hostStyle: CSSProperties = { position: 'relative' };
  const canvasStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  };

  return createElement(
    'div',
    { style: hostStyle },
    // The content is a plain block child — its height is the host's height.
    createElement('div', { ref: contentRef }, props.children),
    createElement('canvas', { ref: canvasRef, 'aria-hidden': true, style: canvasStyle }),
  );
}

/**
 * Wraps a measured markdown subtree with a streaming fade-in canvas. Its height
 * is exactly the subtree's height — the canvas overlay is out of flow and never
 * measured.
 */
export const FadeMarkdown = markPrimitive(renderFadeMarkdown as (props: FadeMarkdownProps) => ReactElement, {
  name: 'FadeMarkdown',
  measure: (props, ctx: MeasureContext) => measureChildren((props as unknown as FadeMarkdownProps).children, ctx),
  naturalWidth: (props, ctx: MeasureContext) =>
    naturalWidthOf((props as unknown as FadeMarkdownProps).children, ctx),
});
