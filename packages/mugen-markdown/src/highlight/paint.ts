/**
 * The canvas-overlay painter behind code-block syntax highlighting.
 *
 * The `<pre><code>` keeps doing what it does today — lay out, select, copy,
 * scroll — and stays the accessibility/semantics source of truth. Highlighting
 * is layered on as pure paint: token colours are drawn onto absolutely
 * positioned canvas tiles over the text, and once every visible glyph has been
 * painted the DOM text flips to `color: transparent` in the same frame. Until
 * that moment the plain text is simply visible, so first paint is never blocked
 * by tokenization.
 *
 * Invariants this file is built around:
 * - Painting never affects layout. Tiles are absolutely positioned inside the
 *   `<pre>` (which scrolls them with the code), sized to the measured text, and
 *   the block's height stays `lines × lineHeight + padding` exactly.
 * - Tokenization is time-sliced (a few ms per task) and incremental per line
 *   state, so streaming appends re-tokenize only the changed tail and repaint
 *   only the dirty lines.
 * - Canvas memory is bounded: tiles allocate their backing store only while
 *   near the visible window and free it once they are far outside it.
 *
 * Tile visibility is computed *synchronously* from scroll/resize events on the
 * block's scroll ancestors (plus the window): painting happens in the same
 * task as the scroll, before the browser paints that frame, so a concealed
 * block can never show a blank tile while scrolling. An IntersectionObserver
 * is kept only as a backup signal for movement that produces no scroll event
 * (e.g. the virtualizer repositioning rows). A viewport-rooted observer alone
 * is not enough: its `rootMargin` does not extend into a nested scroller's
 * clip, so it provides no prefetch inside a scrollable list — and its async
 * delivery shows a flash of nothing where the code should be.
 */
import type { Font } from '@wingleeio/mugen/native-core';
import type { LanguageProfile } from './languages';
import { INITIAL_STATE, tokenizeLine, type LineState, type Token } from './tokenize';
import type { CodeTokenColors } from './types';

export interface HighlightInput {
  codeEl: HTMLElement;
  overlayEl: HTMLElement;
  value: string;
  font: Font;
  lineHeight: number;
  profile: LanguageProfile;
  colors: CodeTokenColors;
}

/** Tab stops assumed by the painter; the `<pre>` pins `tab-size` to match. */
export const TAB_COLUMNS = 8;

const TILE_LINES = 96;
const SYNC_BUDGET_MS = 4;
const CHUNK_BUDGET_MS = 6;
/** Dirty-line count beyond which we show the DOM text while re-tokenizing. */
const REVEAL_THRESHOLD = 512;

interface Tile {
  canvas: HTMLCanvasElement;
  /** First line index this tile covers. */
  start: number;
  /** Lines `[start, dirtyFrom)` are painted; `dirtyFrom >= end` means clean. */
  dirtyFrom: number;
  /** Within the prefetch margin of the visible window (kept painted). */
  visible: boolean;
  cssWidth: number;
  dpr: number;
}

interface FontMetrics {
  ascent: number;
  descent: number;
  tabAdvance: number;
}

let sharedMeasure: CanvasRenderingContext2D | null | undefined;
function measureCtx(): CanvasRenderingContext2D | null {
  if (sharedMeasure === undefined) {
    sharedMeasure =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d', { willReadFrequently: false });
    if (sharedMeasure != null && typeof sharedMeasure.measureText !== 'function') {
      sharedMeasure = null; // partial DOM shims (happy-dom) — leave text visible
    }
    // Code renders literal characters — turn off the font's `===`/`!=`
    // ligatures (and kerning, which monospace code doesn't use anyway) so the
    // painted glyphs match the DOM `<code>` (`font-variant-ligatures: none`).
    if (sharedMeasure != null) sharedMeasure.textRendering = 'optimizeSpeed';
  }
  return sharedMeasure;
}

/** Visible lines, matching the measure's `lineCount` (trailing `\n` is silent). */
function splitLines(value: string): string[] {
  const parts = value.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export class HighlightSession {
  private input: HighlightInput | null = null;
  private lines: string[] = [];
  private tokens: Token[][] = [];
  private ends: LineState[] = [];
  private widths: (number | undefined)[] = [];
  /** Number of lines tokenized so far (a prefix of `lines`). */
  private done = 0;
  private tiles: Tile[] = [];
  /** Scrollable ancestors of the block (visibility window + scroll signals). */
  private scrollers: Element[] = [];
  /** True while the DOM text is visible and the overlay hidden. */
  private revealed = true;
  private plainColor: string | null = null;
  private metrics: FontMetrics | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private io: IntersectionObserver | null = null;
  private unlisten: (() => void)[] = [];

  update(next: HighlightInput): void {
    if (measureCtx() == null) return; // no usable 2d canvas — stay plain
    const prev = this.input;
    this.input = next;
    if (prev == null) this.listen();

    const fontChanged =
      prev == null || prev.font !== next.font || prev.lineHeight !== next.lineHeight;
    const profileChanged = prev == null || prev.profile !== next.profile;
    const colorsChanged = prev == null || prev.colors !== next.colors;

    const lines = splitLines(next.value);
    let dirty = 0;
    if (!profileChanged) {
      const max = Math.min(this.lines.length, lines.length);
      while (dirty < max && this.lines[dirty] === lines[dirty]) dirty++;
      if (dirty === max && this.lines.length === lines.length) dirty = lines.length;
    }
    this.lines = lines;
    if (this.done > dirty) this.done = dirty;
    this.widths.length = Math.min(this.widths.length, dirty);
    if (fontChanged) {
      this.metrics = null;
      this.widths.length = 0;
    }

    this.layoutTiles();

    const invalidateFrom = fontChanged || colorsChanged ? 0 : dirty;
    for (const t of this.tiles) {
      t.dirtyFrom = Math.min(t.dirtyFrom, Math.max(invalidateFrom, t.start));
    }
    if (colorsChanged) this.plainColor = null;

    // A wholesale replacement would leave a stale painting under transparent
    // text for several frames — show the DOM text until the repaint lands.
    if (!this.revealed && this.lines.length - this.done > REVEAL_THRESHOLD) this.reveal();
    if (this.lines.length === 0) this.reveal();

    if (this.pending != null) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    this.work(SYNC_BUDGET_MS);
  }

  destroy(): void {
    if (this.pending != null) clearTimeout(this.pending);
    this.pending = null;
    this.io?.disconnect();
    this.io = null;
    for (const u of this.unlisten) u();
    this.unlisten = [];
    if (this.input != null) this.reveal();
    for (const t of this.tiles) t.canvas.remove();
    this.tiles = [];
    this.scrollers = [];
    this.input = null;
  }

  // ── Scheduling ───────────────────────────────────────────────────────────────

  private work(budget: number): void {
    const { profile } = this.input!;
    const t0 = performance.now();
    while (this.done < this.lines.length) {
      const i = this.done;
      const st = i === 0 ? INITIAL_STATE : this.ends[i - 1]!;
      const r = tokenizeLine(this.lines[i]!, st, profile);
      this.tokens[i] = r.tokens;
      this.ends[i] = r.end;
      this.done++;
      if ((this.done & 31) === 0 && performance.now() - t0 > budget) break;
    }
    this.syncVisibility();
    if (this.done < this.lines.length) {
      this.pending = setTimeout(() => {
        this.pending = null;
        this.work(CHUNK_BUDGET_MS);
      }, 0);
    }
  }

  /**
   * Recompute which tiles are near the visible window, paint the dirty ones
   * (tokens permitting), free the far ones, and conceal/reveal accordingly.
   * Runs synchronously on scroll/resize, so a tile entering the window is
   * painted before the browser paints that frame — never a blank flash.
   */
  private syncVisibility(): void {
    const input = this.input;
    if (input == null) return;
    if (this.tiles.length > 0) {
      const codeTop = input.codeEl.getBoundingClientRect().top;
      // Visible vertical window: the viewport clipped by every scroll ancestor.
      let top = 0;
      let bottom = window.innerHeight;
      for (const sc of this.scrollers) {
        const r = sc.getBoundingClientRect();
        if (r.top > top) top = r.top;
        if (r.bottom < bottom) bottom = r.bottom;
      }
      const margin = Math.max(400, bottom - top);
      const { lineHeight } = input;
      for (const t of this.tiles) {
        const tileTop = codeTop + t.start * lineHeight;
        const tileBottom = codeTop + this.tileEnd(t) * lineHeight;
        if (tileBottom > top - margin && tileTop < bottom + margin) {
          t.visible = true;
          const end = this.tileEnd(t);
          if (t.dirtyFrom < end && this.done >= end) this.paintTile(t);
        } else {
          t.visible = false;
          // Hysteresis: keep the painting until the tile is far outside the
          // window, so small back-and-forth scrolls don't thrash repaints.
          if (
            (tileBottom < top - 2 * margin || tileTop > bottom + 2 * margin) &&
            t.canvas.width !== 0
          ) {
            t.canvas.width = 0;
            t.canvas.height = 0;
            t.cssWidth = 0;
            t.dirtyFrom = t.start;
          }
        }
      }
    }
    this.maybeConceal();
  }

  /** Swap DOM glyphs for canvas glyphs, atomically within the current task. */
  private maybeConceal(): void {
    if (!this.revealed || this.lines.length === 0) return;
    if (this.done < this.lines.length) return;
    for (const t of this.tiles) {
      if (t.visible && t.dirtyFrom < this.tileEnd(t)) return;
    }
    const { codeEl, overlayEl } = this.input!;
    this.revealed = false;
    codeEl.style.color = 'transparent';
    overlayEl.style.visibility = 'visible';
  }

  private reveal(): void {
    if (this.revealed) return;
    this.revealed = true;
    const { codeEl, overlayEl } = this.input!;
    codeEl.style.color = '';
    overlayEl.style.visibility = 'hidden';
  }

  // ── Tiles ────────────────────────────────────────────────────────────────────

  private tileEnd(t: Tile): number {
    return Math.min(t.start + TILE_LINES, this.lines.length);
  }

  private layoutTiles(): void {
    const { overlayEl, lineHeight } = this.input!;
    const count = Math.ceil(this.lines.length / TILE_LINES);
    while (this.tiles.length > count) {
      const t = this.tiles.pop()!;
      this.io?.unobserve(t.canvas);
      t.canvas.remove();
    }
    while (this.tiles.length < count) {
      const start = this.tiles.length * TILE_LINES;
      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;
      Object.assign(canvas.style, {
        position: 'absolute',
        left: '0px',
        top: `${start * lineHeight}px`,
        width: '0px',
        height: '0px',
        pointerEvents: 'none',
      });
      overlayEl.appendChild(canvas);
      // Visibility is resolved synchronously by syncVisibility() right after.
      const tile: Tile = { canvas, start, dirtyFrom: start, visible: false, cssWidth: 0, dpr: 0 };
      this.tiles.push(tile);
      this.io?.observe(canvas);
    }
    for (const t of this.tiles) t.canvas.style.top = `${t.start * lineHeight}px`;
  }

  // ── Painting ─────────────────────────────────────────────────────────────────

  private ensureMetrics(ctx: CanvasRenderingContext2D): FontMetrics {
    if (this.metrics != null) return this.metrics;
    const { font } = this.input!;
    ctx.font = font;
    const probe = ctx.measureText('Mg') as TextMetrics & {
      fontBoundingBoxAscent?: number;
      fontBoundingBoxDescent?: number;
    };
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
    const size = sizeMatch != null ? parseFloat(sizeMatch[1]!) : 16;
    this.metrics = {
      ascent: probe.fontBoundingBoxAscent ?? size * 0.8,
      descent: probe.fontBoundingBoxDescent ?? size * 0.2,
      tabAdvance: ctx.measureText(' ').width * TAB_COLUMNS,
    };
    return this.metrics;
  }

  private ensurePlainColor(): string {
    if (this.plainColor != null) return this.plainColor;
    const { codeEl } = this.input!;
    const inline = codeEl.style.color;
    if (!this.revealed) codeEl.style.color = '';
    this.plainColor = getComputedStyle(codeEl).color || '#888';
    if (!this.revealed) codeEl.style.color = inline;
    return this.plainColor;
  }

  /** Draw (or just measure, when `y` is null) `text` from `x`, honouring tabs. */
  private runText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    tabAdvance: number,
    y: number | null,
  ): number {
    let from = 0;
    for (;;) {
      const t = text.indexOf('\t', from);
      const seg = t < 0 ? text.slice(from) : text.slice(from, t);
      if (seg.length > 0) {
        if (y != null) ctx.fillText(seg, x, y);
        x += ctx.measureText(seg).width;
      }
      if (t < 0) return x;
      x = (Math.floor(x / tabAdvance + 1e-6) + 1) * tabAdvance;
      from = t + 1;
    }
  }

  private paintTile(t: Tile): void {
    const { lineHeight, font, colors } = this.input!;
    const mctx = measureCtx()!;
    mctx.font = font;
    const m = this.ensureMetrics(mctx);
    const end = this.tileEnd(t);

    let maxW = 0;
    for (let i = t.start; i < end; i++) {
      const w = (this.widths[i] ??= this.runText(mctx, this.lines[i]!, 0, m.tabAdvance, null));
      if (w > maxW) maxW = w;
    }

    const dpr =
      typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const cssH = (end - t.start) * lineHeight;
    let from = Math.max(t.dirtyFrom, t.start);
    const needResize =
      t.dpr !== dpr ||
      maxW > t.cssWidth ||
      from <= t.start ||
      Math.ceil(cssH * dpr) !== t.canvas.height;
    if (needResize) {
      from = t.start;
      t.cssWidth = maxW;
      t.dpr = dpr;
      t.canvas.width = Math.ceil(maxW * dpr);
      t.canvas.height = Math.ceil(cssH * dpr);
      t.canvas.style.width = `${maxW}px`;
      t.canvas.style.height = `${cssH}px`;
    }
    const ctx = t.canvas.getContext('2d');
    if (ctx == null) {
      t.dirtyFrom = end;
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = font;
    // Match the measure ctx + DOM: literal glyphs, no ligatures.
    ctx.textRendering = 'optimizeSpeed';
    ctx.textBaseline = 'alphabetic';
    if (!needResize) {
      const yTop = (from - t.start) * lineHeight;
      ctx.clearRect(0, yTop, t.cssWidth + 1, cssH - yTop);
    }
    const plain = this.ensurePlainColor();
    const half = (lineHeight - (m.ascent + m.descent)) / 2;
    for (let i = from; i < end; i++) {
      const y = (i - t.start) * lineHeight + half + m.ascent;
      this.paintLine(ctx, this.lines[i]!, this.tokens[i]!, y, m.tabAdvance, colors, plain);
    }
    t.dirtyFrom = end;
  }

  private paintLine(
    ctx: CanvasRenderingContext2D,
    line: string,
    tokens: Token[],
    y: number,
    tabAdvance: number,
    colors: CodeTokenColors,
    plain: string,
  ): void {
    let x = 0;
    let pos = 0;
    let fill = '';
    const setFill = (c: string): void => {
      if (c !== fill) {
        fill = c;
        ctx.fillStyle = c;
      }
    };
    for (let k = 0; k <= tokens.length; k++) {
      const tok = k < tokens.length ? tokens[k]! : null;
      const gapEnd = tok != null ? tok.start : line.length;
      if (gapEnd > pos) {
        setFill(plain);
        x = this.runText(ctx, line.slice(pos, gapEnd), x, tabAdvance, y);
        pos = gapEnd;
      }
      if (tok == null) break;
      const c = colors[tok.type];
      setFill(c === 'currentColor' || c === 'inherit' ? plain : c);
      x = this.runText(ctx, line.slice(tok.start, tok.end), x, tabAdvance, y);
      pos = tok.end;
    }
  }

  // ── Environment listeners ────────────────────────────────────────────────────

  private listen(): void {
    const onSignal = (): void => this.syncVisibility();

    // Primary visibility signal: scroll on every scrollable ancestor (plus
    // the window). Handlers run in the same task as the scroll, so tiles
    // entering the window paint before the frame they appear in.
    const { codeEl } = this.input!;
    this.scrollers = [];
    for (let el = codeEl.parentElement; el != null; el = el.parentElement) {
      const s = getComputedStyle(el);
      const o = `${s.overflowY} ${s.overflowX}`;
      if (o.includes('auto') || o.includes('scroll') || o.includes('overlay')) {
        this.scrollers.push(el);
        el.addEventListener('scroll', onSignal, { passive: true });
        const target = el;
        this.unlisten.push(() => target.removeEventListener('scroll', onSignal));
      }
    }
    window.addEventListener('scroll', onSignal, { passive: true });
    window.addEventListener('resize', onSignal);
    this.unlisten.push(() => {
      window.removeEventListener('scroll', onSignal);
      window.removeEventListener('resize', onSignal);
    });

    // Backup signal for movement that fires no scroll event (the virtualizer
    // repositioning rows). The callback just re-syncs from real geometry.
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(onSignal, { rootMargin: '50%' });
    }

    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts != null && typeof fonts.addEventListener === 'function') {
      const onFonts = (): void => {
        this.metrics = null;
        this.widths.length = 0;
        for (const t of this.tiles) {
          t.dirtyFrom = t.start;
          t.dpr = 0; // force a resize-repaint with the loaded face
        }
        this.syncVisibility();
      };
      fonts.addEventListener('loadingdone', onFonts);
      this.unlisten.push(() => fonts.removeEventListener('loadingdone', onFonts));
    }

    this.watchDpr();
  }

  private watchDpr(): void {
    if (typeof matchMedia !== 'function' || typeof devicePixelRatio !== 'number') return;
    const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    if (typeof mq.addEventListener !== 'function') return;
    const onChange = (): void => {
      stop();
      this.unlisten = this.unlisten.filter((u) => u !== stop);
      for (const t of this.tiles) t.dirtyFrom = t.start;
      this.syncVisibility();
      this.watchDpr();
    };
    const stop = (): void => mq.removeEventListener('change', onChange);
    mq.addEventListener('change', onChange);
    this.unlisten.push(stop);
  }
}
