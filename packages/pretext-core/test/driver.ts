// Drives the fixture-runner CLI (C++ side) and the TS engine (reference side)
// over the same ops, then deep-compares with Object.is number semantics.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  measureLineStats,
  measureNaturalWidth,
  clearCache,
  type PrepareOptions,
  type PreparedText,
  type PreparedTextWithSegments,
} from '@chenglou/pretext';
import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  measureRichInlineStats,
  type RichInlineItem,
  type PreparedRichInline,
} from '@chenglou/pretext/rich-inline';
import {
  installPretextPolyfills,
  registerFont,
  setGenericFontFamily,
  setEmojiAdvanceEm,
  measureTextWidth,
  clearRegisteredFonts,
} from '@wingleeio/pretext-native';

export const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const runnerPath = join(pkgRoot, 'build-host', 'fixture-runner');

export function ensurePolyfills(): void {
  installPretextPolyfills({ force: { canvas: true, segmenter: true } });
}

// --- op types (mirrors tools/fixture-runner/main.cpp) ---

export type Op = Record<string, unknown> & { op: string };

// --- C++ side ---

export class Runner {
  private proc: ChildProcessWithoutNullStreams;
  private lines: Interface;
  private queue: Array<(line: string) => void> = [];

  constructor() {
    if (!existsSync(runnerPath)) {
      throw new Error(
        `fixture-runner not built at ${runnerPath}. Run: pnpm build:host`,
      );
    }
    this.proc = spawn(runnerPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.lines = createInterface({ input: this.proc.stdout });
    this.lines.on('line', line => {
      const resolve = this.queue.shift();
      if (resolve) resolve(line);
    });
  }

  async run(op: Op): Promise<unknown> {
    const promise = new Promise<string>(resolve => this.queue.push(resolve));
    this.proc.stdin.write(JSON.stringify(op) + '\n');
    const line = await promise;
    const parsed = JSON.parse(line) as { ok?: unknown; error?: string };
    if (parsed.error !== undefined) {
      throw new Error(`fixture-runner error for ${JSON.stringify(op)}: ${parsed.error}`);
    }
    return parsed.ok ?? null;
  }

  close(): void {
    this.proc.stdin.end();
    this.proc.kill();
  }
}

// --- TS reference side ---

export class Reference {
  private prepared = new Map<number, PreparedText | PreparedTextWithSegments>();
  private rich = new Map<number, PreparedRichInline>();

  run(op: Op): unknown {
    switch (op.op) {
      case 'registerFont': {
        registerFont({
          family: op.family as string,
          weight: (op.weight as number | undefined) ?? 400,
          style: (op.style as 'normal' | 'italic' | 'oblique' | undefined) ?? 'normal',
          data: readFileSync(op.path as string),
        });
        return null;
      }
      case 'setGenericFontFamily': {
        setGenericFontFamily(op.generic as never, op.family as string);
        return null;
      }
      case 'setEmojiAdvanceEm': {
        setEmojiAdvanceEm(op.value as number);
        return null;
      }
      case 'measureTextWidth':
        return measureTextWidth(op.text as string, op.font as string);
      case 'prepare': {
        const options: PrepareOptions = {
          whiteSpace: (op.whiteSpace as 'normal' | 'pre-wrap' | undefined) ?? 'normal',
          wordBreak: (op.wordBreak as 'normal' | 'keep-all' | undefined) ?? 'normal',
          letterSpacing: (op.letterSpacing as number | undefined) ?? 0,
        };
        const p =
          (op.withSegments ?? true)
            ? prepareWithSegments(op.text as string, op.font as string, options)
            : prepare(op.text as string, op.font as string, options);
        this.prepared.set(op.id as number, p);
        return null;
      }
      case 'preparedDump': {
        const p = this.prepared.get(op.id as number) as unknown as Record<string, unknown>;
        return {
          widths: p.widths,
          lineEndFitAdvances: p.lineEndFitAdvances,
          lineEndPaintAdvances: p.lineEndPaintAdvances,
          kinds: p.kinds,
          simpleLineWalkFastPath: p.simpleLineWalkFastPath,
          breakableFitAdvances: p.breakableFitAdvances,
          breakablePreferredBreaks: p.breakablePreferredBreaks,
          letterSpacing: p.letterSpacing,
          spacingGraphemeCounts: p.spacingGraphemeCounts,
          discretionaryHyphenWidth: p.discretionaryHyphenWidth,
          tabStopAdvance: p.tabStopAdvance,
          chunks: p.chunks,
          ...(p.segments !== undefined ? { segments: p.segments } : {}),
          segLevels:
            p.segLevels == null ? null : Array.from(p.segLevels as Int8Array),
        };
      }
      case 'layout': {
        const p = this.prepared.get(op.id as number)!;
        const r = layout(p, op.maxWidth as number, op.lineHeight as number);
        return { lineCount: r.lineCount, height: r.height };
      }
      case 'layoutWithLines': {
        const p = this.prepared.get(op.id as number) as PreparedTextWithSegments;
        const r = layoutWithLines(p, op.maxWidth as number, op.lineHeight as number);
        return {
          lineCount: r.lineCount,
          height: r.height,
          lines: r.lines.map(l => ({
            text: l.text,
            width: l.width,
            start: l.start,
            end: l.end,
          })),
        };
      }
      case 'measureLineStats': {
        const p = this.prepared.get(op.id as number) as PreparedTextWithSegments;
        return measureLineStats(p, op.maxWidth as number);
      }
      case 'naturalWidth': {
        const p = this.prepared.get(op.id as number) as PreparedTextWithSegments;
        return measureNaturalWidth(p);
      }
      case 'prepareRich': {
        this.rich.set(op.id as number, prepareRichInline(op.items as RichInlineItem[]));
        return null;
      }
      case 'walkRich': {
        const p = this.rich.get(op.id as number)!;
        const materialize = (op.materialize as boolean | undefined) ?? true;
        const lines: unknown[] = [];
        const lineCount = walkRichInlineLineRanges(p, op.maxWidth as number, range => {
          const fragments = materialize
            ? materializeRichInlineLineRange(p, range).fragments.map(f => ({
                itemIndex: f.itemIndex,
                text: f.text,
                gapBefore: f.gapBefore,
                occupiedWidth: f.occupiedWidth,
                start: f.start,
                end: f.end,
              }))
            : range.fragments.map(f => ({
                itemIndex: f.itemIndex,
                gapBefore: f.gapBefore,
                occupiedWidth: f.occupiedWidth,
                start: f.start,
                end: f.end,
              }));
          lines.push({ width: range.width, end: range.end, fragments });
        });
        return { lineCount, lines };
      }
      case 'richStats': {
        const p = this.rich.get(op.id as number)!;
        return measureRichInlineStats(p, op.maxWidth as number);
      }
      case 'clearCache': {
        clearCache();
        this.prepared.clear();
        this.rich.clear();
        return null;
      }
      default:
        throw new Error(`unknown op ${op.op}`);
    }
  }
}

// --- comparison: Object.is for numbers, === otherwise, deep for containers ---

export function diffValues(a: unknown, b: unknown, path = '$'): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(a, b) ? [] : [`${path}: TS ${a} !== C++ ${b}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return [`${path}.length: TS ${a.length} !== C++ ${b.length}`];
    }
    const out: string[] = [];
    for (let i = 0; i < a.length; i++) {
      out.push(...diffValues(a[i], b[i], `${path}[${i}]`));
      if (out.length > 8) return out;
    }
    return out;
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join(',') !== kb.join(',')) {
      return [`${path} keys: TS [${ka}] !== C++ [${kb}]`];
    }
    const out: string[] = [];
    for (const k of ka) {
      out.push(
        ...diffValues(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          `${path}.${k}`,
        ),
      );
      if (out.length > 8) return out;
    }
    return out;
  }
  return a === b ? [] : [`${path}: TS ${JSON.stringify(a)} !== C++ ${JSON.stringify(b)}`];
}

// Run an op on both sides and return mismatch strings (empty = match).
export async function compareOp(
  runner: Runner,
  reference: Reference,
  op: Op,
): Promise<string[]> {
  const [cpp, ts] = [await runner.run(op), reference.run(op)];
  const diffs = diffValues(ts, cpp);
  return diffs.map(d => `${JSON.stringify(op).slice(0, 160)} → ${d}`);
}

export const fontOps: Op[] = [
  { op: 'registerFont', family: 'Geist', weight: 400, style: 'normal', path: join(pkgRoot, 'test/fonts/Geist_400Regular.ttf') },
  { op: 'registerFont', family: 'Geist', weight: 500, style: 'normal', path: join(pkgRoot, 'test/fonts/Geist_500Medium.ttf') },
  { op: 'registerFont', family: 'Geist', weight: 600, style: 'normal', path: join(pkgRoot, 'test/fonts/Geist_600SemiBold.ttf') },
  { op: 'registerFont', family: 'Geist', weight: 700, style: 'normal', path: join(pkgRoot, 'test/fonts/Geist_700Bold.ttf') },
  { op: 'registerFont', family: 'Geist Mono', weight: 400, style: 'normal', path: join(pkgRoot, 'test/fonts/GeistMono_400Regular.ttf') },
  { op: 'setGenericFontFamily', generic: 'sans-serif', family: 'Geist' },
  { op: 'setGenericFontFamily', generic: 'monospace', family: 'Geist Mono' },
];

export function resetReferenceFonts(): void {
  clearRegisteredFonts();
}
