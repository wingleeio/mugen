// Minimal sfnt (TTF/OTF/TTC) parser.
//
// pretext only ever asks a font one question: "how wide is this string?" —
// so we extract exactly the tables that answer it and nothing else:
//
//   head  -> unitsPerEm (the scale factor between font units and px)
//   maxp  -> numGlyphs
//   hhea  -> numberOfHMetrics (+ ascender/descender/lineGap as metadata)
//   hmtx  -> per-glyph advance widths
//   cmap  -> code point -> glyph id
//   kern  -> legacy pair kerning (format 0)
//   GPOS  -> modern pair kerning ('kern' feature, PairPos lookups)
//
// No glyf/CFF outlines, no shaping, no ligatures. That is a deliberate
// accuracy trade-off documented in the package README-of-the-future: advance
// widths + pair kerning reproduce what canvas measureText reports for the
// vast majority of Latin/CJK text; contextual shaping (Arabic joining,
// ligature substitution via GSUB) is out of scope.
//
// Checksums are deliberately NOT verified: we parse fonts the app itself
// bundles, and rejecting a font over a stale checksum would only hurt.
// Malformed optional tables (kern/GPOS) degrade gracefully to "no kerning";
// we only throw when the font is unusable for measurement at all
// (no cmap or no horizontal metrics).

export type ParsedFont = {
  unitsPerEm: number;
  // hhea vertical metrics in font units — not needed for widths, but callers
  // computing line heights from the same font file will want them.
  ascender: number;
  descender: number;
  lineGap: number;
  numGlyphs: number;
  /** Code point -> glyph id. 0 (.notdef) means "not mapped". */
  glyphForCodePoint(codePoint: number): number;
  /** Advance width in font units for a glyph id (clamped into range). */
  advanceForGlyph(glyphId: number): number;
  /**
   * Pair kerning adjustment in font units (usually negative). If the font has
   * a GPOS 'kern' feature we use it EXCLUSIVELY and ignore the legacy `kern`
   * table — real shaping engines pick one source, never sum both.
   */
  kerningForPair(leftGlyph: number, rightGlyph: number): number;
};

// --- byte helpers ------------------------------------------------------------

function u16(dv: DataView, o: number): number {
  return dv.getUint16(o);
}
function i16(dv: DataView, o: number): number {
  return dv.getInt16(o);
}
function u32(dv: DataView, o: number): number {
  return dv.getUint32(o);
}

/** Number of set bits in a 16-bit value — used for ValueRecord sizing. */
function popCount16(v: number): number {
  let count = 0;
  for (let bit = v & 0xffff; bit !== 0; bit >>= 1) count += bit & 1;
  return count;
}

// --- offset table ------------------------------------------------------------

const TAG_TTCF = 0x74746366; // 'ttcf'
const TAG_OTTO = 0x4f54544f; // 'OTTO' (CFF outlines)
const TAG_TRUE = 0x74727565; // 'true' (legacy Apple)
const SFNT_V1 = 0x00010000;

type TableDirectory = Map<string, { offset: number; length: number }>;

function tagToString(tag: number): string {
  return String.fromCharCode((tag >>> 24) & 0xff, (tag >>> 16) & 0xff, (tag >>> 8) & 0xff, tag & 0xff);
}

function parseTableDirectory(dv: DataView): TableDirectory {
  let dirOffset = 0;
  if (u32(dv, 0) === TAG_TTCF) {
    // TrueType Collection: take the first face. Collection members share
    // tables and their directory offsets are absolute from file start, so no
    // base adjustment is needed beyond jumping to the member's directory.
    const numFonts = u32(dv, 8);
    if (numFonts === 0) throw new Error('pretext-native: TTC contains no fonts.');
    dirOffset = u32(dv, 12);
  }

  const version = u32(dv, dirOffset);
  if (version !== SFNT_V1 && version !== TAG_OTTO && version !== TAG_TRUE) {
    throw new Error(
      `pretext-native: unsupported sfnt version 0x${version.toString(16)} — expected TTF (0x00010000/'true') or OTF ('OTTO').`,
    );
  }

  const numTables = u16(dv, dirOffset + 4);
  const tables: TableDirectory = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = dirOffset + 12 + i * 16;
    const tag = tagToString(u32(dv, rec));
    tables.set(tag, { offset: u32(dv, rec + 8), length: u32(dv, rec + 12) });
  }
  return tables;
}

// --- cmap ---------------------------------------------------------------------

type CmapLookup = (codePoint: number) => number;

// Preference order per the spec: full-Unicode subtables (format 12 capable)
// beat BMP-only ones. Higher score wins; unsupported formats are skipped so a
// font with e.g. a format-14 UVS subtable still falls back to its format 4.
function cmapSubtableScore(platformId: number, encodingId: number): number {
  if (platformId === 3 && encodingId === 10) return 5; // Windows, full Unicode
  if (platformId === 0 && (encodingId === 4 || encodingId === 5 || encodingId === 6)) return 4; // Unicode full
  if (platformId === 3 && encodingId === 1) return 3; // Windows BMP
  if (platformId === 0 && encodingId <= 3) return 2; // Unicode BMP
  return 0;
}

function parseCmapFormat4(dv: DataView, sub: number): CmapLookup {
  const segCountX2 = u16(dv, sub + 6);
  const segCount = segCountX2 >> 1;
  const endCodes = sub + 14;
  const startCodes = endCodes + segCountX2 + 2; // +2 skips reservedPad
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;

  return (cp: number): number => {
    if (cp > 0xffff) return 0;
    // Binary search for the first segment whose endCode >= cp.
    let lo = 0;
    let hi = segCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (u16(dv, endCodes + mid * 2) < cp) lo = mid + 1;
      else hi = mid;
    }
    if (u16(dv, startCodes + lo * 2) > cp) return 0;
    const idRangeOffset = u16(dv, idRangeOffsets + lo * 2);
    const delta = i16(dv, idDeltas + lo * 2);
    if (idRangeOffset === 0) return (cp + delta) & 0xffff;
    // idRangeOffset is famously self-relative: it points from its own
    // position in the idRangeOffsets array into the glyphIdArray.
    const glyphAddr = idRangeOffsets + lo * 2 + idRangeOffset + (cp - u16(dv, startCodes + lo * 2)) * 2;
    const glyph = u16(dv, glyphAddr);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  };
}

function parseCmapFormat6(dv: DataView, sub: number): CmapLookup {
  const firstCode = u16(dv, sub + 6);
  const entryCount = u16(dv, sub + 8);
  return (cp: number): number => {
    const idx = cp - firstCode;
    if (idx < 0 || idx >= entryCount) return 0;
    return u16(dv, sub + 10 + idx * 2);
  };
}

function parseCmapFormat12(dv: DataView, sub: number): CmapLookup {
  const numGroups = u32(dv, sub + 12);
  const groups = sub + 16; // sequential {startChar u32, endChar u32, startGlyph u32}
  return (cp: number): number => {
    let lo = 0;
    let hi = numGroups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = groups + mid * 12;
      if (cp < u32(dv, g)) hi = mid - 1;
      else if (cp > u32(dv, g + 4)) lo = mid + 1;
      else return u32(dv, g + 8) + (cp - u32(dv, g));
    }
    return 0;
  };
}

function parseCmap(dv: DataView, cmapOffset: number): CmapLookup {
  const numSubtables = u16(dv, cmapOffset + 2);
  let best: { score: number; offset: number; format: number } | null = null;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const score = cmapSubtableScore(u16(dv, rec), u16(dv, rec + 2));
    if (score === 0) continue;
    const subOffset = cmapOffset + u32(dv, rec + 4);
    const format = u16(dv, subOffset);
    if (format !== 4 && format !== 6 && format !== 12) continue;
    if (best === null || score > best.score) best = { score, offset: subOffset, format };
  }
  if (best === null) {
    throw new Error('pretext-native: font has no supported cmap subtable (need format 4, 6, or 12).');
  }
  if (best.format === 12) return parseCmapFormat12(dv, best.offset);
  if (best.format === 6) return parseCmapFormat6(dv, best.offset);
  return parseCmapFormat4(dv, best.offset);
}

// --- kern (legacy) -------------------------------------------------------------

function parseKern(dv: DataView, kernOffset: number, kernLength: number): Map<number, number> | null {
  // Only the Microsoft-style version-0 table. Apple's 'kern' (u32 version
  // 0x00010000) has a different subtable header; fonts that ship it almost
  // always also ship GPOS, so skipping it loses little.
  if (u16(dv, kernOffset) !== 0) return null;
  const nTables = u16(dv, kernOffset + 2);
  const pairs = new Map<number, number>();
  let p = kernOffset + 4;
  const end = kernOffset + kernLength;
  for (let t = 0; t < nTables && p + 6 <= end; t++) {
    const length = u16(dv, p + 2);
    const coverage = u16(dv, p + 4);
    const format = coverage >> 8;
    const horizontal = (coverage & 1) === 1;
    if (format === 0 && horizontal) {
      const nPairs = u16(dv, p + 6);
      const recs = p + 14; // skips nPairs + searchRange + entrySelector + rangeShift
      for (let i = 0; i < nPairs; i++) {
        const r = recs + i * 6;
        if (r + 6 > end) break;
        pairs.set((u16(dv, r) << 16) | u16(dv, r + 2), i16(dv, r + 4));
      }
    }
    if (length === 0) break; // malformed — avoid an infinite loop
    p += length;
  }
  return pairs.size > 0 ? pairs : null;
}

// --- GPOS pair kerning -----------------------------------------------------------

type PairAdjust = (leftGlyph: number, rightGlyph: number) => number | null;

/** Coverage table -> function returning the coverage index, or -1 if absent. */
function parseCoverage(dv: DataView, off: number): (glyph: number) => number {
  const format = u16(dv, off);
  if (format === 1) {
    const glyphCount = u16(dv, off + 2);
    const arr = off + 4;
    return (glyph: number): number => {
      let lo = 0;
      let hi = glyphCount - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = u16(dv, arr + mid * 2);
        if (glyph < g) hi = mid - 1;
        else if (glyph > g) lo = mid + 1;
        else return mid;
      }
      return -1;
    };
  }
  if (format === 2) {
    const rangeCount = u16(dv, off + 2);
    const ranges = off + 4; // {start u16, end u16, startCoverageIndex u16}
    return (glyph: number): number => {
      let lo = 0;
      let hi = rangeCount - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = ranges + mid * 6;
        if (glyph < u16(dv, r)) hi = mid - 1;
        else if (glyph > u16(dv, r + 2)) lo = mid + 1;
        else return u16(dv, r + 4) + (glyph - u16(dv, r));
      }
      return -1;
    };
  }
  throw new Error(`pretext-native: unsupported Coverage format ${format}.`);
}

/** ClassDef table -> function returning a glyph's class (default class 0). */
function parseClassDef(dv: DataView, off: number): (glyph: number) => number {
  const format = u16(dv, off);
  if (format === 1) {
    const startGlyph = u16(dv, off + 2);
    const glyphCount = u16(dv, off + 4);
    const values = off + 6;
    return (glyph: number): number => {
      const idx = glyph - startGlyph;
      return idx >= 0 && idx < glyphCount ? u16(dv, values + idx * 2) : 0;
    };
  }
  if (format === 2) {
    const rangeCount = u16(dv, off + 2);
    const ranges = off + 4; // {start u16, end u16, class u16}
    return (glyph: number): number => {
      let lo = 0;
      let hi = rangeCount - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = ranges + mid * 6;
        if (glyph < u16(dv, r)) hi = mid - 1;
        else if (glyph > u16(dv, r + 2)) lo = mid + 1;
        else return u16(dv, r + 4);
      }
      return 0;
    };
  }
  throw new Error(`pretext-native: unsupported ClassDef format ${format}.`);
}

const VALUE_X_ADVANCE = 0x0004;

function parsePairPosSubtable(dv: DataView, st: number): PairAdjust | null {
  const posFormat = u16(dv, st);
  const valueFormat1 = u16(dv, st + 4);
  const valueFormat2 = u16(dv, st + 6);
  // We only extract the FIRST value record's xAdvance — that's what pair
  // kerning adjusts. If the subtable doesn't carry xAdvance there is nothing
  // for us here.
  if ((valueFormat1 & VALUE_X_ADVANCE) === 0) return null;
  const size1 = popCount16(valueFormat1) * 2;
  const size2 = popCount16(valueFormat2) * 2;
  // ValueRecord field order is fixed (XPlacement 0x1, YPlacement 0x2,
  // XAdvance 0x4, ...), so xAdvance sits after however many lower-bit fields
  // are present.
  const xAdvanceByteOffset = popCount16(valueFormat1 & 0x0003) * 2;

  if (posFormat === 1) {
    const coverage = parseCoverage(dv, st + u16(dv, st + 2));
    const pairSetCount = u16(dv, st + 8);
    const recordSize = 2 + size1 + size2; // secondGlyph + value1 + value2
    return (left: number, right: number): number | null => {
      const covIndex = coverage(left);
      if (covIndex < 0 || covIndex >= pairSetCount) return null;
      const pairSet = st + u16(dv, st + 10 + covIndex * 2);
      const pairCount = u16(dv, pairSet);
      // Records are sorted by secondGlyph — binary search.
      let lo = 0;
      let hi = pairCount - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rec = pairSet + 2 + mid * recordSize;
        const second = u16(dv, rec);
        if (right < second) hi = mid - 1;
        else if (right > second) lo = mid + 1;
        else return i16(dv, rec + 2 + xAdvanceByteOffset);
      }
      return null;
    };
  }

  if (posFormat === 2) {
    const coverage = parseCoverage(dv, st + u16(dv, st + 2));
    const classDef1 = parseClassDef(dv, st + u16(dv, st + 8));
    const classDef2 = parseClassDef(dv, st + u16(dv, st + 10));
    const class1Count = u16(dv, st + 12);
    const class2Count = u16(dv, st + 14);
    const records = st + 16;
    const recordSize = size1 + size2;
    return (left: number, right: number): number | null => {
      if (coverage(left) < 0) return null;
      const c1 = classDef1(left);
      const c2 = classDef2(right);
      if (c1 >= class1Count || c2 >= class2Count) return null;
      return i16(dv, records + (c1 * class2Count + c2) * recordSize + xAdvanceByteOffset);
    };
  }

  return null; // unknown PairPos format — ignore
}

const GPOS_LOOKUP_PAIR = 2;
const GPOS_LOOKUP_EXTENSION = 9;
const TAG_KERN = 0x6b65726e; // 'kern'

// ScriptList-independent walk: any 'kern' feature counts, regardless of which
// script/language system references it. Real text stacks resolve features per
// script, but for horizontal pair kerning the lookups are the same in
// practice, and skipping script resolution keeps this parser tiny.
function parseGposKern(dv: DataView, gpos: number): PairAdjust | null {
  const featureListOff = gpos + u16(dv, gpos + 6);
  const lookupListOff = gpos + u16(dv, gpos + 8);

  const lookupIndices = new Set<number>();
  const featureCount = u16(dv, featureListOff);
  for (let i = 0; i < featureCount; i++) {
    const rec = featureListOff + 2 + i * 6;
    if (u32(dv, rec) !== TAG_KERN) continue;
    const feature = featureListOff + u16(dv, rec + 4);
    const lookupIndexCount = u16(dv, feature + 2);
    for (let j = 0; j < lookupIndexCount; j++) {
      lookupIndices.add(u16(dv, feature + 4 + j * 2));
    }
  }
  if (lookupIndices.size === 0) return null;

  const lookupCount = u16(dv, lookupListOff);
  const subtables: PairAdjust[] = [];
  for (const idx of [...lookupIndices].sort((a, b) => a - b)) {
    if (idx >= lookupCount) continue;
    const lookup = lookupListOff + u16(dv, lookupListOff + 2 + idx * 2);
    const lookupType = u16(dv, lookup);
    const subTableCount = u16(dv, lookup + 4);
    for (let k = 0; k < subTableCount; k++) {
      let st = lookup + u16(dv, lookup + 6 + k * 2);
      let type = lookupType;
      if (type === GPOS_LOOKUP_EXTENSION) {
        // Extension positioning just relocates a real subtable behind a
        // 32-bit offset (used when GPOS outgrows 16-bit offsets).
        if (u16(dv, st) !== 1) continue;
        type = u16(dv, st + 2);
        st = st + u32(dv, st + 4);
      }
      if (type !== GPOS_LOOKUP_PAIR) continue;
      const fn = parsePairPosSubtable(dv, st);
      if (fn !== null) subtables.push(fn);
    }
  }
  if (subtables.length === 0) return null;

  // Within a lookup the first matching subtable wins; we flatten across
  // lookups the same way. Kerning is virtually always a single lookup, so
  // this simplification does not change results for real fonts.
  return (left: number, right: number): number | null => {
    for (const fn of subtables) {
      const v = fn(left, right);
      if (v !== null) return v;
    }
    return null;
  };
}

// --- top level -------------------------------------------------------------------

export function parseFont(data: ArrayBuffer | Uint8Array): ParsedFont {
  // Respect a Uint8Array's view window — callers may hand us a slice of a
  // larger buffer (e.g. an asset bundle).
  const dv =
    data instanceof Uint8Array
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
      : new DataView(data);

  const tables = parseTableDirectory(dv);
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (!head || !maxp || !hhea || !hmtx || !cmap) {
    const missing = ['head', 'maxp', 'hhea', 'hmtx', 'cmap'].filter((t) => !tables.has(t));
    throw new Error(`pretext-native: font is missing required table(s): ${missing.join(', ')}.`);
  }

  const unitsPerEm = u16(dv, head.offset + 18);
  if (unitsPerEm === 0) throw new Error('pretext-native: font has unitsPerEm of 0.');
  const numGlyphs = u16(dv, maxp.offset + 4);
  const ascender = i16(dv, hhea.offset + 4);
  const descender = i16(dv, hhea.offset + 6);
  const lineGap = i16(dv, hhea.offset + 8);
  const numberOfHMetrics = u16(dv, hhea.offset + 34);

  // hmtx: long metrics (advance + lsb) for the first numberOfHMetrics glyphs;
  // every glyph after that reuses the LAST advance (monospaced tails).
  const advances = new Uint16Array(numGlyphs);
  let lastAdvance = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numberOfHMetrics) lastAdvance = u16(dv, hmtx.offset + g * 4);
    advances[g] = lastAdvance;
  }

  const cmapLookup = parseCmap(dv, cmap.offset);

  // Optional kerning sources — never fatal.
  let gposKern: PairAdjust | null = null;
  const gposEntry = tables.get('GPOS');
  if (gposEntry) {
    try {
      gposKern = parseGposKern(dv, gposEntry.offset);
    } catch {
      gposKern = null; // malformed GPOS -> just no kerning from it
    }
  }
  let kernPairs: Map<number, number> | null = null;
  if (gposKern === null) {
    const kernEntry = tables.get('kern');
    if (kernEntry) {
      try {
        kernPairs = parseKern(dv, kernEntry.offset, kernEntry.length);
      } catch {
        kernPairs = null;
      }
    }
  }

  return {
    unitsPerEm,
    ascender,
    descender,
    lineGap,
    numGlyphs,
    glyphForCodePoint: cmapLookup,
    advanceForGlyph(glyphId: number): number {
      if (glyphId < 0 || glyphId >= numGlyphs) return 0;
      return advances[glyphId]!;
    },
    kerningForPair(leftGlyph: number, rightGlyph: number): number {
      if (gposKern !== null) return gposKern(leftGlyph, rightGlyph) ?? 0;
      if (kernPairs !== null) return kernPairs.get((leftGlyph << 16) | rightGlyph) ?? 0;
      return 0;
    },
  };
}
