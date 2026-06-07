import { createIncremarkParser, type IncremarkParser, type ParserOptions } from '@incremark/core';
import type { Root } from 'mdast';

/**
 * Markdown parsing options — a curated subset of incremark's `ParserOptions`.
 * `gfm` (tables, task lists, strikethrough, autolinks) is on by default because
 * it's what people mean by "markdown" today.
 */
export interface MarkdownParseOptions {
  /** GitHub-Flavored Markdown: tables, task lists, strikethrough, autolinks. Default `true`. */
  gfm?: boolean;
  /** `$…$` / `$$…$$` math. Off by default (needs a math-capable component override to render). */
  math?: ParserOptions['math'];
  /** `:::` directive containers. Off by default. */
  containers?: ParserOptions['containers'];
}

const DEFAULTS: MarkdownParseOptions = { gfm: true };

function optionsKey(opts: MarkdownParseOptions): string {
  return JSON.stringify([
    opts.gfm ?? true,
    typeof opts.math === 'object' ? opts.math : (opts.math ?? false),
    typeof opts.containers === 'object' ? true : (opts.containers ?? false),
  ]);
}

function makeParser(opts: MarkdownParseOptions): IncremarkParser {
  return createIncremarkParser({
    gfm: opts.gfm ?? true,
    math: opts.math ?? false,
    containers: opts.containers ?? false,
  });
}

// ── AST cache ────────────────────────────────────────────────────────────────
// Exact-source → AST. `<Markdown>` is a pure component invoked once in mugen's
// measure walk and once in React's render for the same `source`; this makes the
// second call free and keeps re-measures (on width change) free too. The AST is
// treated as immutable. LRU-bounded so a long session can't grow it unbounded.
const MAX_AST_CACHE = 512;
const astCache = new Map<string, Root>();

function readAst(cacheKey: string): Root | undefined {
  const cached = astCache.get(cacheKey);
  if (cached === undefined) return undefined;
  astCache.delete(cacheKey); // refresh LRU recency
  astCache.set(cacheKey, cached);
  return cached;
}

function writeAst(cacheKey: string, ast: Root): void {
  if (astCache.has(cacheKey)) astCache.delete(cacheKey);
  else if (astCache.size >= MAX_AST_CACHE) {
    const oldest = astCache.keys().next().value;
    if (oldest !== undefined) astCache.delete(oldest);
  }
  astCache.set(cacheKey, ast);
}

// ── Incremental parser pool ──────────────────────────────────────────────────
// incremark parses incrementally: a parser caches completed blocks and only
// re-parses the trailing pending region on each `append`. To exploit that, we
// keep a small pool of live parsers, each remembering the last source it parsed.
// When a new `source` arrives that *extends* one of them (the common case: a
// streaming message growing, or a row re-rendering as it streams), we append only
// the delta — O(delta), not O(source). A non-extending change (an edit, a brand
// new document) falls back to a fresh parser. Static rows whose source never
// changes are served entirely from the AST cache and never touch a parser twice.
interface LiveParser {
  key: string;
  parser: IncremarkParser;
  lastSource: string;
}

// Enough for several documents streaming at once; the active streaming row is
// usually just one. MRU-ordered (index 0 = most recent); LRU is evicted.
const MAX_LIVE = 16;
const live: LiveParser[] = [];

/** Find the live parser (same options) whose source is the longest proper prefix of `source`. */
function findExtensible(key: string, source: string): number {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < live.length; i++) {
    const e = live[i]!;
    if (e.key !== key) continue;
    const len = e.lastSource.length;
    if (len < source.length && len > bestLen && source.startsWith(e.lastSource)) {
      bestIdx = i;
      bestLen = len;
    }
  }
  return bestIdx;
}

function promote(idx: number): LiveParser {
  const [entry] = live.splice(idx, 1);
  live.unshift(entry!);
  return entry!;
}

/**
 * Parse markdown into an mdast `Root` with incremark, memoized by
 * `(source, options)` and parsed **incrementally** when the source grows.
 *
 * Pure and synchronous — safe to call inside mugen's measure walk. Growing the
 * same source (a streaming row) appends only the new text to a retained parser;
 * an unchanged source is served from the AST cache; a non-extending change parses
 * fresh.
 */
export function parseMarkdown(source: string, options: MarkdownParseOptions = DEFAULTS): Root {
  const key = optionsKey(options);
  const cacheKey = `${key} ${source}`;

  const cached = readAst(cacheKey);
  if (cached !== undefined) return cached;

  let ast: Root;
  const idx = findExtensible(key, source);
  if (idx >= 0) {
    // The source extends a parser we already have — append just the delta.
    const entry = promote(idx);
    const delta = source.slice(entry.lastSource.length);
    ast = entry.parser.append(delta).ast;
    entry.lastSource = source;
  } else {
    // New (or non-extending) document — parse fresh and retain the parser so a
    // subsequent growth can extend it. No `finalize()`: an un-finalized parser
    // can keep appending, and incremark's AST already includes the pending tail.
    const parser = makeParser(options);
    ast = parser.append(source).ast;
    live.unshift({ key, parser, lastSource: source });
    if (live.length > MAX_LIVE) live.pop();
  }

  writeAst(cacheKey, ast);
  return ast;
}

/** Drop the parse caches and retained parsers (tests / memory pressure). */
export function clearParseCache(): void {
  astCache.clear();
  live.length = 0;
}
