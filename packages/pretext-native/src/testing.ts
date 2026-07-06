// Test-only TTF builder: constructs a minimal-but-valid sfnt binary in memory
// so the parser/measurement tests are hermetic — no font files on disk, no
// network. Excluded from the published build (tsdown's entry is src/index.ts
// only), so this never ships.
//
// Table checksums are written as 0: the parser deliberately does not verify
// checksums (see src/sfnt/parse.ts), so computing them would only test code
// that doesn't exist.

class ByteWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u8(v: number): this {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >>> 8).u8(v);
  }
  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number): this {
    return this.u16(v >>> 16).u16(v);
  }
  tag(s: string): this {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  raw(data: Uint8Array): this {
    for (const b of data) this.bytes.push(b);
    return this;
  }
  /** Pad to a 4-byte boundary (sfnt tables are long-aligned). */
  pad4(): this {
    while (this.bytes.length % 4 !== 0) this.u8(0);
    return this;
  }
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

export type TestFontSpec = {
  unitsPerEm?: number; // default 1000
  /** Glyph ids are assigned 1..n in array order; glyph 0 is .notdef. */
  glyphs: { char: string; advance: number }[];
  notdefAdvance?: number; // default 500
  ascender?: number; // default 800
  descender?: number; // default -200
  lineGap?: number; // default 0
  /** Legacy `kern` table format-0 pairs (font units). */
  kernPairs?: { left: string; right: string; value: number }[];
  /** GPOS 'kern' feature, PairPosFormat1, xAdvance-only value records. */
  gposPairs?: { left: string; right: string; xAdvance: number }[];
};

export function buildTestFont(spec: TestFontSpec): Uint8Array {
  const unitsPerEm = spec.unitsPerEm ?? 1000;
  const notdefAdvance = spec.notdefAdvance ?? 500;

  // Stable char -> glyph id assignment; cmap format 4 requires segments
  // sorted by code point, so sort a copy for the cmap while glyph ids keep
  // the caller's order.
  const glyphIdOf = new Map<number, number>();
  spec.glyphs.forEach((g, i) => glyphIdOf.set(g.char.codePointAt(0)!, i + 1));
  const numGlyphs = spec.glyphs.length + 1;
  const gid = (char: string): number => {
    const id = glyphIdOf.get(char.codePointAt(0)!);
    if (id === undefined) throw new Error(`test font does not define glyph for '${char}'`);
    return id;
  };

  // --- head (54 bytes; parser reads unitsPerEm at offset 18) ---
  const head = new ByteWriter()
    .u32(0x00010000) // version
    .u32(0) // fontRevision
    .u32(0) // checkSumAdjustment
    .u32(0x5f0f3cf5) // magicNumber
    .u16(0) // flags
    .u16(unitsPerEm)
    .u32(0).u32(0) // created (longdatetime)
    .u32(0).u32(0) // modified
    .i16(0).i16(0).i16(0).i16(0) // xMin/yMin/xMax/yMax
    .u16(0) // macStyle
    .u16(8) // lowestRecPPEM
    .i16(2) // fontDirectionHint
    .i16(0) // indexToLocFormat
    .i16(0) // glyphDataFormat
    .toUint8Array();

  // --- maxp (version 1.0 is 32 bytes; parser reads numGlyphs at offset 4) ---
  const maxp = new ByteWriter().u32(0x00010000).u16(numGlyphs);
  while (maxp.length < 32) maxp.u16(0);

  // --- hhea (36 bytes; numberOfHMetrics at offset 34) ---
  const hhea = new ByteWriter()
    .u32(0x00010000)
    .i16(spec.ascender ?? 800)
    .i16(spec.descender ?? -200)
    .i16(spec.lineGap ?? 0)
    .u16(0) // advanceWidthMax
    .i16(0).i16(0).i16(0) // minLSB/minRSB/xMaxExtent
    .i16(1).i16(0).i16(0) // caretSlopeRise/Run/Offset
    .i16(0).i16(0).i16(0).i16(0) // reserved
    .i16(0) // metricDataFormat
    .u16(numGlyphs) // numberOfHMetrics: long metrics for every glyph
    .toUint8Array();

  // --- hmtx: {advance u16, lsb i16} per glyph ---
  const hmtx = new ByteWriter().u16(notdefAdvance).i16(0);
  for (const g of spec.glyphs) hmtx.u16(g.advance).i16(0);

  // --- cmap format 4: one segment per mapped char + the mandatory 0xFFFF ---
  const sortedCps = [...glyphIdOf.keys()].sort((a, b) => a - b);
  const segCount = sortedCps.length + 1;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  const cmap = (() => {
    const w = new ByteWriter()
      .u16(0) // cmap version
      .u16(1) // numTables
      .u16(3) // platformID: Windows
      .u16(1) // encodingID: Unicode BMP
      .u32(12); // subtable offset
    w.u16(4).u16(16 + segCount * 8).u16(0);
    w.u16(segCount * 2).u16(searchRange).u16(Math.floor(Math.log2(segCount))).u16(segCount * 2 - searchRange);
    for (const cp of sortedCps) w.u16(cp);
    w.u16(0xffff);
    w.u16(0); // reservedPad
    for (const cp of sortedCps) w.u16(cp);
    w.u16(0xffff);
    for (const cp of sortedCps) w.u16((glyphIdOf.get(cp)! - cp) & 0xffff); // idDelta (mod 65536)
    w.u16(1); // idDelta for the 0xFFFF segment: maps 0xFFFF -> glyph 0
    for (let s = 0; s < segCount; s++) w.u16(0); // idRangeOffsets: all delta-mapped
    return w.toUint8Array();
  })();

  // --- kern (version 0, one horizontal format-0 subtable) ---
  let kern: Uint8Array | null = null;
  if (spec.kernPairs && spec.kernPairs.length > 0) {
    const pairs = spec.kernPairs
      .map((p) => ({ left: gid(p.left), right: gid(p.right), value: p.value }))
      .sort((a, b) => (a.left << 16 | a.right) - (b.left << 16 | b.right));
    const w = new ByteWriter()
      .u16(0) // table version
      .u16(1) // nTables
      .u16(0) // subtable version
      .u16(14 + pairs.length * 6) // subtable length
      .u16(0x0001) // coverage: horizontal, format 0
      .u16(pairs.length)
      .u16(0).u16(0).u16(0); // search fields (unused by the parser)
    for (const p of pairs) w.u16(p.left).u16(p.right).i16(p.value);
    kern = w.toUint8Array();
  }

  // --- GPOS: ScriptList(1 dummy DFLT) + FeatureList('kern') + one
  // LookupType-2 PairPosFormat1 subtable with xAdvance-only value records ---
  let gpos: Uint8Array | null = null;
  if (spec.gposPairs && spec.gposPairs.length > 0) {
    // Group by left glyph: coverage lists each distinct left glyph (sorted),
    // and its coverage index selects the PairSet.
    const byLeft = new Map<number, { right: number; xAdvance: number }[]>();
    for (const p of spec.gposPairs) {
      const left = gid(p.left);
      let list = byLeft.get(left);
      if (!list) {
        list = [];
        byLeft.set(left, list);
      }
      list.push({ right: gid(p.right), xAdvance: p.xAdvance });
    }
    const lefts = [...byLeft.keys()].sort((a, b) => a - b);
    for (const list of byLeft.values()) list.sort((a, b) => a.right - b.right);

    // PairPos layout: header (10 + 2*pairSetCount), then Coverage, then the
    // PairSets. All offsets are relative to the PairPos subtable start.
    const pairSetCount = lefts.length;
    const covOff = 10 + 2 * pairSetCount;
    const covSize = 4 + 2 * pairSetCount; // format 1 coverage
    const pairSetOffsets: number[] = [];
    let cursor = covOff + covSize;
    for (const left of lefts) {
      pairSetOffsets.push(cursor);
      cursor += 2 + byLeft.get(left)!.length * 4; // count + {secondGlyph u16, xAdvance i16} records
    }

    const pairPos = new ByteWriter()
      .u16(1) // posFormat 1
      .u16(covOff)
      .u16(0x0004) // valueFormat1: xAdvance only
      .u16(0x0000) // valueFormat2: nothing
      .u16(pairSetCount);
    for (const off of pairSetOffsets) pairPos.u16(off);
    pairPos.u16(1).u16(pairSetCount); // Coverage format 1 + glyphCount
    for (const left of lefts) pairPos.u16(left);
    for (const left of lefts) {
      const list = byLeft.get(left)!;
      pairPos.u16(list.length);
      for (const rec of list) pairPos.u16(rec.right).i16(rec.xAdvance);
    }
    const pairPosBytes = pairPos.toUint8Array();

    // Fixed offsets computed by hand — every sub-structure here has a known
    // size (see the offset comments).
    const w = new ByteWriter()
      .u32(0x00010000) // GPOS version
      .u16(10) // scriptListOffset
      .u16(30) // featureListOffset
      .u16(44); // lookupListOffset
    // ScriptList @10 (20 bytes): 1 dummy DFLT script so the table is
    // well-formed for other consumers, though our parser walks features only.
    w.u16(1).tag('DFLT').u16(8); // scriptCount, record -> Script @18
    w.u16(4).u16(0); // Script: defaultLangSysOffset=4, langSysCount=0
    w.u16(0).u16(0xffff).u16(1).u16(0); // LangSys @22: featureIndex 0
    // FeatureList @30 (14 bytes)
    w.u16(1).tag('kern').u16(8); // featureCount, record -> Feature @38
    w.u16(0).u16(1).u16(0); // Feature: params=0, 1 lookup, lookup index 0
    // LookupList @44
    w.u16(1).u16(4); // lookupCount, offset -> Lookup @48
    w.u16(2).u16(0).u16(1).u16(8); // Lookup: type 2, flag 0, 1 subtable @ +8
    w.raw(pairPosBytes); // PairPos @56
    gpos = w.toUint8Array();
  }

  // --- assemble ---
  const tables: { tag: string; data: Uint8Array }[] = [
    { tag: 'head', data: head },
    { tag: 'hhea', data: hhea },
    { tag: 'maxp', data: maxp.toUint8Array() },
    { tag: 'hmtx', data: hmtx.toUint8Array() },
    { tag: 'cmap', data: cmap },
  ];
  if (kern) tables.push({ tag: 'kern', data: kern });
  if (gpos) tables.push({ tag: 'GPOS', data: gpos });

  return assembleSfnt(tables, 0);
}

function assembleSfnt(tables: { tag: string; data: Uint8Array }[], baseOffset: number): Uint8Array {
  const numTables = tables.length;
  const w = new ByteWriter()
    .u32(0x00010000)
    .u16(numTables)
    .u16(0).u16(0).u16(0); // search fields, unused by the parser

  // Directory first, then table data; compute offsets up front. `baseOffset`
  // lets buildTestCollection produce absolute-from-file-start offsets.
  let offset = baseOffset + 12 + numTables * 16;
  const placed = tables.map((t) => {
    const entry = { ...t, offset };
    offset += t.data.length + ((4 - (t.data.length % 4)) % 4);
    return entry;
  });
  for (const t of placed) {
    w.tag(t.tag).u32(0 /* checksum: not verified */).u32(t.offset).u32(t.data.length);
  }
  for (const t of placed) {
    w.raw(t.data).pad4();
  }
  return w.toUint8Array();
}

/** Wrap a font spec in a single-member TrueType Collection ('ttcf'). */
export function buildTestCollection(spec: TestFontSpec): Uint8Array {
  // TTC header is 12 bytes (tag, version, numFonts) + one u32 directory
  // offset = 16; member table offsets are absolute from file start.
  const header = new ByteWriter().tag('ttcf').u32(0x00010000).u32(1).u32(16);
  // Rebuild the member with offsets shifted past the header. Easiest path:
  // buildTestFont writes offsets relative to the member start, so re-run
  // assembly with baseOffset 16 by round-tripping through the table list is
  // overkill — instead, parse-free shift: rebuild via buildTestFontWithBase.
  const member = buildTestFontWithBase(spec, 16);
  return new ByteWriter().raw(header.toUint8Array()).raw(member).toUint8Array();
}

function buildTestFontWithBase(spec: TestFontSpec, baseOffset: number): Uint8Array {
  // The plain builder writes offsets relative to position 0; patch each
  // directory entry's offset field by baseOffset instead of duplicating the
  // whole builder.
  const font = buildTestFont(spec);
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    dv.setUint32(rec + 8, dv.getUint32(rec + 8) + baseOffset);
  }
  return font;
}
