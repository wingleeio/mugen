// Port of packages/pretext-native/src/sfnt/parse.ts
//
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
// No glyf/CFF outlines, no shaping, no ligatures. Checksums are deliberately
// NOT verified. Malformed optional tables (kern/GPOS) degrade gracefully to
// "no kerning"; we only throw when the font is unusable for measurement at
// all (no cmap or no horizontal metrics).

#include "sfnt.hpp"

#include <cstdio>
#include <functional>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>

namespace pretext::fonts {

namespace {

// --- byte helpers ------------------------------------------------------------

// Mirrors a JS DataView over the font bytes: out-of-range reads throw (JS
// throws RangeError; here std::runtime_error per PORTING.md rule 8).
struct DataView {
  const uint8_t* bytes = nullptr;
  size_t byteLength = 0;

  void check(int64_t o, int64_t n) const {
    if (o < 0 || o + n > static_cast<int64_t>(byteLength)) {
      throw std::runtime_error("pretext-native: DataView read outside the bounds of the font data.");
    }
  }
};

int32_t u16(const DataView& dv, int64_t o) {
  dv.check(o, 2);
  return (int32_t(dv.bytes[o]) << 8) | int32_t(dv.bytes[o + 1]);
}
int32_t i16(const DataView& dv, int64_t o) {
  dv.check(o, 2);
  return int32_t(int16_t((uint16_t(dv.bytes[o]) << 8) | uint16_t(dv.bytes[o + 1])));
}
uint32_t u32(const DataView& dv, int64_t o) {
  dv.check(o, 4);
  return (uint32_t(dv.bytes[o]) << 24) | (uint32_t(dv.bytes[o + 1]) << 16) |
         (uint32_t(dv.bytes[o + 2]) << 8) | uint32_t(dv.bytes[o + 3]);
}

/** Number of set bits in a 16-bit value — used for ValueRecord sizing. */
int32_t popCount16(int32_t v) {
  int32_t count = 0;
  for (int32_t bit = v & 0xffff; bit != 0; bit >>= 1) count += bit & 1;
  return count;
}

// --- offset table ------------------------------------------------------------

constexpr uint32_t TAG_TTCF = 0x74746366;  // 'ttcf'
constexpr uint32_t TAG_OTTO = 0x4f54544f;  // 'OTTO' (CFF outlines)
constexpr uint32_t TAG_TRUE = 0x74727565;  // 'true' (legacy Apple)
constexpr uint32_t SFNT_V1 = 0x00010000;

struct TableEntry {
  int64_t offset = 0;
  int64_t length = 0;
};
using TableDirectory = std::unordered_map<std::string, TableEntry>;

std::string tagToString(uint32_t tag) {
  std::string s;
  s.push_back(char((tag >> 24) & 0xff));
  s.push_back(char((tag >> 16) & 0xff));
  s.push_back(char((tag >> 8) & 0xff));
  s.push_back(char(tag & 0xff));
  return s;
}

TableDirectory parseTableDirectory(const DataView& dv) {
  int64_t dirOffset = 0;
  if (u32(dv, 0) == TAG_TTCF) {
    // TrueType Collection: take the first face. Collection members share
    // tables and their directory offsets are absolute from file start, so no
    // base adjustment is needed beyond jumping to the member's directory.
    const uint32_t numFonts = u32(dv, 8);
    if (numFonts == 0) throw std::runtime_error("pretext-native: TTC contains no fonts.");
    dirOffset = u32(dv, 12);
  }

  const uint32_t version = u32(dv, dirOffset);
  if (version != SFNT_V1 && version != TAG_OTTO && version != TAG_TRUE) {
    char hex[16];
    std::snprintf(hex, sizeof(hex), "%x", version);  // JS Number.toString(16)
    throw std::runtime_error(std::string("pretext-native: unsupported sfnt version 0x") + hex +
                             " \xE2\x80\x94 expected TTF (0x00010000/'true') or OTF ('OTTO').");
  }

  const int32_t numTables = u16(dv, dirOffset + 4);
  TableDirectory tables;
  for (int32_t i = 0; i < numTables; i++) {
    const int64_t rec = dirOffset + 12 + int64_t(i) * 16;
    const std::string tag = tagToString(u32(dv, rec));
    tables[tag] = TableEntry{int64_t(u32(dv, rec + 8)), int64_t(u32(dv, rec + 12))};
  }
  return tables;
}

// --- cmap ---------------------------------------------------------------------

using CmapLookup = std::function<int32_t(int32_t)>;

// Preference order per the spec: full-Unicode subtables (format 12 capable)
// beat BMP-only ones. Higher score wins; unsupported formats are skipped so a
// font with e.g. a format-14 UVS subtable still falls back to its format 4.
int32_t cmapSubtableScore(int32_t platformId, int32_t encodingId) {
  if (platformId == 3 && encodingId == 10) return 5;  // Windows, full Unicode
  if (platformId == 0 && (encodingId == 4 || encodingId == 5 || encodingId == 6)) return 4;  // Unicode full
  if (platformId == 3 && encodingId == 1) return 3;  // Windows BMP
  if (platformId == 0 && encodingId <= 3) return 2;  // Unicode BMP
  return 0;
}

CmapLookup parseCmapFormat4(const DataView& dv, int64_t sub) {
  const int32_t segCountX2 = u16(dv, sub + 6);
  const int32_t segCount = segCountX2 >> 1;
  const int64_t endCodes = sub + 14;
  const int64_t startCodes = endCodes + segCountX2 + 2;  // +2 skips reservedPad
  const int64_t idDeltas = startCodes + segCountX2;
  const int64_t idRangeOffsets = idDeltas + segCountX2;

  return [dv, segCount, endCodes, startCodes, idDeltas, idRangeOffsets](int32_t cp) -> int32_t {
    if (cp > 0xffff) return 0;
    // Binary search for the first segment whose endCode >= cp.
    int32_t lo = 0;
    int32_t hi = segCount - 1;
    while (lo < hi) {
      const int32_t mid = (lo + hi) >> 1;
      if (u16(dv, endCodes + int64_t(mid) * 2) < cp) lo = mid + 1;
      else hi = mid;
    }
    if (u16(dv, startCodes + int64_t(lo) * 2) > cp) return 0;
    const int32_t idRangeOffset = u16(dv, idRangeOffsets + int64_t(lo) * 2);
    const int32_t delta = i16(dv, idDeltas + int64_t(lo) * 2);
    if (idRangeOffset == 0) return (cp + delta) & 0xffff;
    // idRangeOffset is famously self-relative: it points from its own
    // position in the idRangeOffsets array into the glyphIdArray.
    const int64_t glyphAddr =
        idRangeOffsets + int64_t(lo) * 2 + idRangeOffset + int64_t(cp - u16(dv, startCodes + int64_t(lo) * 2)) * 2;
    const int32_t glyph = u16(dv, glyphAddr);
    return glyph == 0 ? 0 : (glyph + delta) & 0xffff;
  };
}

CmapLookup parseCmapFormat6(const DataView& dv, int64_t sub) {
  const int32_t firstCode = u16(dv, sub + 6);
  const int32_t entryCount = u16(dv, sub + 8);
  return [dv, sub, firstCode, entryCount](int32_t cp) -> int32_t {
    const int32_t idx = cp - firstCode;
    if (idx < 0 || idx >= entryCount) return 0;
    return u16(dv, sub + 10 + int64_t(idx) * 2);
  };
}

CmapLookup parseCmapFormat12(const DataView& dv, int64_t sub) {
  const int64_t numGroups = u32(dv, sub + 12);
  const int64_t groups = sub + 16;  // sequential {startChar u32, endChar u32, startGlyph u32}
  return [dv, numGroups, groups](int32_t cp) -> int32_t {
    const uint32_t ucp = uint32_t(cp);
    int64_t lo = 0;
    int64_t hi = numGroups - 1;
    while (lo <= hi) {
      const int64_t mid = (lo + hi) >> 1;
      const int64_t g = groups + mid * 12;
      if (ucp < u32(dv, g)) hi = mid - 1;
      else if (ucp > u32(dv, g + 4)) lo = mid + 1;
      else return int32_t(u32(dv, g + 8) + (ucp - u32(dv, g)));
    }
    return 0;
  };
}

CmapLookup parseCmap(const DataView& dv, int64_t cmapOffset) {
  const int32_t numSubtables = u16(dv, cmapOffset + 2);
  bool haveBest = false;
  int32_t bestScore = 0;
  int64_t bestOffset = 0;
  int32_t bestFormat = 0;
  for (int32_t i = 0; i < numSubtables; i++) {
    const int64_t rec = cmapOffset + 4 + int64_t(i) * 8;
    const int32_t score = cmapSubtableScore(u16(dv, rec), u16(dv, rec + 2));
    if (score == 0) continue;
    const int64_t subOffset = cmapOffset + u32(dv, rec + 4);
    const int32_t format = u16(dv, subOffset);
    if (format != 4 && format != 6 && format != 12) continue;
    if (!haveBest || score > bestScore) {
      haveBest = true;
      bestScore = score;
      bestOffset = subOffset;
      bestFormat = format;
    }
  }
  if (!haveBest) {
    throw std::runtime_error("pretext-native: font has no supported cmap subtable (need format 4, 6, or 12).");
  }
  if (bestFormat == 12) return parseCmapFormat12(dv, bestOffset);
  if (bestFormat == 6) return parseCmapFormat6(dv, bestOffset);
  return parseCmapFormat4(dv, bestOffset);
}

// --- kern (legacy) -------------------------------------------------------------

using KernPairs = std::unordered_map<uint32_t, int32_t>;

std::optional<KernPairs> parseKern(const DataView& dv, int64_t kernOffset, int64_t kernLength) {
  // Only the Microsoft-style version-0 table. Apple's 'kern' (u32 version
  // 0x00010000) has a different subtable header; fonts that ship it almost
  // always also ship GPOS, so skipping it loses little.
  if (u16(dv, kernOffset) != 0) return std::nullopt;
  const int32_t nTables = u16(dv, kernOffset + 2);
  KernPairs pairs;
  int64_t p = kernOffset + 4;
  const int64_t end = kernOffset + kernLength;
  for (int32_t t = 0; t < nTables && p + 6 <= end; t++) {
    const int32_t length = u16(dv, p + 2);
    const int32_t coverage = u16(dv, p + 4);
    const int32_t format = coverage >> 8;
    const bool horizontal = (coverage & 1) == 1;
    if (format == 0 && horizontal) {
      const int32_t nPairs = u16(dv, p + 6);
      const int64_t recs = p + 14;  // skips nPairs + searchRange + entrySelector + rangeShift
      for (int32_t i = 0; i < nPairs; i++) {
        const int64_t r = recs + int64_t(i) * 6;
        if (r + 6 > end) break;
        pairs[(uint32_t(u16(dv, r)) << 16) | uint32_t(u16(dv, r + 2))] = i16(dv, r + 4);
      }
    }
    if (length == 0) break;  // malformed — avoid an infinite loop
    p += length;
  }
  if (pairs.size() > 0) return pairs;
  return std::nullopt;
}

// --- GPOS pair kerning -----------------------------------------------------------

// null-able like the TS PairAdjust: an empty std::function means "no kerning
// source"; std::nullopt from a call means "this pair has no adjustment here".
using PairAdjust = std::function<std::optional<int32_t>(int32_t, int32_t)>;

/** Coverage table -> function returning the coverage index, or -1 if absent. */
std::function<int32_t(int32_t)> parseCoverage(const DataView& dv, int64_t off) {
  const int32_t format = u16(dv, off);
  if (format == 1) {
    const int32_t glyphCount = u16(dv, off + 2);
    const int64_t arr = off + 4;
    return [dv, glyphCount, arr](int32_t glyph) -> int32_t {
      int32_t lo = 0;
      int32_t hi = glyphCount - 1;
      while (lo <= hi) {
        const int32_t mid = (lo + hi) >> 1;
        const int32_t g = u16(dv, arr + int64_t(mid) * 2);
        if (glyph < g) hi = mid - 1;
        else if (glyph > g) lo = mid + 1;
        else return mid;
      }
      return -1;
    };
  }
  if (format == 2) {
    const int32_t rangeCount = u16(dv, off + 2);
    const int64_t ranges = off + 4;  // {start u16, end u16, startCoverageIndex u16}
    return [dv, rangeCount, ranges](int32_t glyph) -> int32_t {
      int32_t lo = 0;
      int32_t hi = rangeCount - 1;
      while (lo <= hi) {
        const int32_t mid = (lo + hi) >> 1;
        const int64_t r = ranges + int64_t(mid) * 6;
        if (glyph < u16(dv, r)) hi = mid - 1;
        else if (glyph > u16(dv, r + 2)) lo = mid + 1;
        else return u16(dv, r + 4) + (glyph - u16(dv, r));
      }
      return -1;
    };
  }
  throw std::runtime_error("pretext-native: unsupported Coverage format " + std::to_string(format) + ".");
}

/** ClassDef table -> function returning a glyph's class (default class 0). */
std::function<int32_t(int32_t)> parseClassDef(const DataView& dv, int64_t off) {
  const int32_t format = u16(dv, off);
  if (format == 1) {
    const int32_t startGlyph = u16(dv, off + 2);
    const int32_t glyphCount = u16(dv, off + 4);
    const int64_t values = off + 6;
    return [dv, startGlyph, glyphCount, values](int32_t glyph) -> int32_t {
      const int32_t idx = glyph - startGlyph;
      return idx >= 0 && idx < glyphCount ? u16(dv, values + int64_t(idx) * 2) : 0;
    };
  }
  if (format == 2) {
    const int32_t rangeCount = u16(dv, off + 2);
    const int64_t ranges = off + 4;  // {start u16, end u16, class u16}
    return [dv, rangeCount, ranges](int32_t glyph) -> int32_t {
      int32_t lo = 0;
      int32_t hi = rangeCount - 1;
      while (lo <= hi) {
        const int32_t mid = (lo + hi) >> 1;
        const int64_t r = ranges + int64_t(mid) * 6;
        if (glyph < u16(dv, r)) hi = mid - 1;
        else if (glyph > u16(dv, r + 2)) lo = mid + 1;
        else return u16(dv, r + 4);
      }
      return 0;
    };
  }
  throw std::runtime_error("pretext-native: unsupported ClassDef format " + std::to_string(format) + ".");
}

constexpr int32_t VALUE_X_ADVANCE = 0x0004;

PairAdjust parsePairPosSubtable(const DataView& dv, int64_t st) {
  const int32_t posFormat = u16(dv, st);
  const int32_t valueFormat1 = u16(dv, st + 4);
  const int32_t valueFormat2 = u16(dv, st + 6);
  // We only extract the FIRST value record's xAdvance — that's what pair
  // kerning adjusts. If the subtable doesn't carry xAdvance there is nothing
  // for us here.
  if ((valueFormat1 & VALUE_X_ADVANCE) == 0) return nullptr;
  const int32_t size1 = popCount16(valueFormat1) * 2;
  const int32_t size2 = popCount16(valueFormat2) * 2;
  // ValueRecord field order is fixed (XPlacement 0x1, YPlacement 0x2,
  // XAdvance 0x4, ...), so xAdvance sits after however many lower-bit fields
  // are present.
  const int32_t xAdvanceByteOffset = popCount16(valueFormat1 & 0x0003) * 2;

  if (posFormat == 1) {
    const auto coverage = parseCoverage(dv, st + u16(dv, st + 2));
    const int32_t pairSetCount = u16(dv, st + 8);
    const int32_t recordSize = 2 + size1 + size2;  // secondGlyph + value1 + value2
    return [dv, st, coverage, pairSetCount, recordSize, xAdvanceByteOffset](
               int32_t left, int32_t right) -> std::optional<int32_t> {
      const int32_t covIndex = coverage(left);
      if (covIndex < 0 || covIndex >= pairSetCount) return std::nullopt;
      const int64_t pairSet = st + u16(dv, st + 10 + int64_t(covIndex) * 2);
      const int32_t pairCount = u16(dv, pairSet);
      // Records are sorted by secondGlyph — binary search.
      int32_t lo = 0;
      int32_t hi = pairCount - 1;
      while (lo <= hi) {
        const int32_t mid = (lo + hi) >> 1;
        const int64_t rec = pairSet + 2 + int64_t(mid) * recordSize;
        const int32_t second = u16(dv, rec);
        if (right < second) hi = mid - 1;
        else if (right > second) lo = mid + 1;
        else return i16(dv, rec + 2 + xAdvanceByteOffset);
      }
      return std::nullopt;
    };
  }

  if (posFormat == 2) {
    const auto coverage = parseCoverage(dv, st + u16(dv, st + 2));
    const auto classDef1 = parseClassDef(dv, st + u16(dv, st + 8));
    const auto classDef2 = parseClassDef(dv, st + u16(dv, st + 10));
    const int32_t class1Count = u16(dv, st + 12);
    const int32_t class2Count = u16(dv, st + 14);
    const int64_t records = st + 16;
    const int32_t recordSize = size1 + size2;
    return [dv, coverage, classDef1, classDef2, class1Count, class2Count, records, recordSize,
            xAdvanceByteOffset](int32_t left, int32_t right) -> std::optional<int32_t> {
      if (coverage(left) < 0) return std::nullopt;
      const int32_t c1 = classDef1(left);
      const int32_t c2 = classDef2(right);
      if (c1 >= class1Count || c2 >= class2Count) return std::nullopt;
      return i16(dv, records + int64_t(c1 * class2Count + c2) * recordSize + xAdvanceByteOffset);
    };
  }

  return nullptr;  // unknown PairPos format — ignore
}

constexpr int32_t GPOS_LOOKUP_PAIR = 2;
constexpr int32_t GPOS_LOOKUP_EXTENSION = 9;
constexpr uint32_t TAG_KERN = 0x6b65726e;  // 'kern'

// ScriptList-independent walk: any 'kern' feature counts, regardless of which
// script/language system references it. Real text stacks resolve features per
// script, but for horizontal pair kerning the lookups are the same in
// practice, and skipping script resolution keeps this parser tiny.
PairAdjust parseGposKern(const DataView& dv, int64_t gpos) {
  const int64_t featureListOff = gpos + u16(dv, gpos + 6);
  const int64_t lookupListOff = gpos + u16(dv, gpos + 8);

  std::set<int32_t> lookupIndices;  // iterates ascending, like the sorted TS array
  const int32_t featureCount = u16(dv, featureListOff);
  for (int32_t i = 0; i < featureCount; i++) {
    const int64_t rec = featureListOff + 2 + int64_t(i) * 6;
    if (u32(dv, rec) != TAG_KERN) continue;
    const int64_t feature = featureListOff + u16(dv, rec + 4);
    const int32_t lookupIndexCount = u16(dv, feature + 2);
    for (int32_t j = 0; j < lookupIndexCount; j++) {
      lookupIndices.insert(u16(dv, feature + 4 + int64_t(j) * 2));
    }
  }
  if (lookupIndices.size() == 0) return nullptr;

  const int32_t lookupCount = u16(dv, lookupListOff);
  std::vector<PairAdjust> subtables;
  for (const int32_t idx : lookupIndices) {
    if (idx >= lookupCount) continue;
    const int64_t lookup = lookupListOff + u16(dv, lookupListOff + 2 + int64_t(idx) * 2);
    const int32_t lookupType = u16(dv, lookup);
    const int32_t subTableCount = u16(dv, lookup + 4);
    for (int32_t k = 0; k < subTableCount; k++) {
      int64_t st = lookup + u16(dv, lookup + 6 + int64_t(k) * 2);
      int32_t type = lookupType;
      if (type == GPOS_LOOKUP_EXTENSION) {
        // Extension positioning just relocates a real subtable behind a
        // 32-bit offset (used when GPOS outgrows 16-bit offsets).
        if (u16(dv, st) != 1) continue;
        type = u16(dv, st + 2);
        st = st + u32(dv, st + 4);
      }
      if (type != GPOS_LOOKUP_PAIR) continue;
      PairAdjust fn = parsePairPosSubtable(dv, st);
      if (fn != nullptr) subtables.push_back(std::move(fn));
    }
  }
  if (subtables.size() == 0) return nullptr;

  // Within a lookup the first matching subtable wins; we flatten across
  // lookups the same way. Kerning is virtually always a single lookup, so
  // this simplification does not change results for real fonts.
  return [subtables = std::move(subtables)](int32_t left, int32_t right) -> std::optional<int32_t> {
    for (const auto& fn : subtables) {
      const auto v = fn(left, right);
      if (v.has_value()) return v;
    }
    return std::nullopt;
  };
}

// --- top level -------------------------------------------------------------------

class ParsedFontImpl final : public ParsedFont {
 public:
  // The font binary is COPIED in (RegisterFontOptions.data is borrowed); all
  // lookup closures capture DataViews pointing into this vector.
  std::vector<uint8_t> data;
  std::vector<uint16_t> advances;  // Uint16Array
  CmapLookup cmapLookup;
  PairAdjust gposKern;                      // empty == null
  std::optional<KernPairs> kernPairs;       // nullopt == null

  // Every adjacent glyph pair in every measured string consults kerning; a
  // per-pair memo collapses steady-state kerning to one map hit (mirrors the
  // TS kernCache).
  mutable std::unordered_map<uint32_t, int32_t> kernCache;

  int32_t glyphForCodePoint(char32_t codePoint) const override {
    return cmapLookup(int32_t(codePoint));
  }

  int32_t advanceForGlyph(int32_t glyphId) const override {
    if (glyphId < 0 || glyphId >= numGlyphs) return 0;
    return advances[size_t(glyphId)];
  }

  int32_t kerningForPair(int32_t leftGlyph, int32_t rightGlyph) const override {
    const uint32_t key = (uint32_t(leftGlyph) << 16) | uint32_t(rightGlyph);
    const auto it = kernCache.find(key);
    if (it != kernCache.end()) return it->second;
    int32_t v;
    if (gposKern != nullptr) {
      const auto adj = gposKern(leftGlyph, rightGlyph);
      v = adj.has_value() ? *adj : 0;
    } else if (kernPairs.has_value()) {
      const auto kit = kernPairs->find(key);
      v = kit != kernPairs->end() ? kit->second : 0;
    } else {
      v = 0;
    }
    kernCache.emplace(key, v);
    return v;
  }
};

}  // namespace

ParsedFontPtr parseFont(const uint8_t* data, size_t size) {
  auto font = std::make_shared<ParsedFontImpl>();
  font->data.assign(data, data + size);
  const DataView dv{font->data.data(), font->data.size()};

  const TableDirectory tables = parseTableDirectory(dv);
  const auto head = tables.find("head");
  const auto maxp = tables.find("maxp");
  const auto hhea = tables.find("hhea");
  const auto hmtx = tables.find("hmtx");
  const auto cmap = tables.find("cmap");
  if (head == tables.end() || maxp == tables.end() || hhea == tables.end() || hmtx == tables.end() ||
      cmap == tables.end()) {
    std::string missing;
    for (const char* t : {"head", "maxp", "hhea", "hmtx", "cmap"}) {
      if (tables.find(t) == tables.end()) {
        if (!missing.empty()) missing += ", ";
        missing += t;
      }
    }
    throw std::runtime_error("pretext-native: font is missing required table(s): " + missing + ".");
  }

  const int32_t unitsPerEm = u16(dv, head->second.offset + 18);
  if (unitsPerEm == 0) throw std::runtime_error("pretext-native: font has unitsPerEm of 0.");
  const int32_t numGlyphs = u16(dv, maxp->second.offset + 4);
  const int32_t ascender = i16(dv, hhea->second.offset + 4);
  const int32_t descender = i16(dv, hhea->second.offset + 6);
  const int32_t lineGap = i16(dv, hhea->second.offset + 8);
  const int32_t numberOfHMetrics = u16(dv, hhea->second.offset + 34);

  // hmtx: long metrics (advance + lsb) for the first numberOfHMetrics glyphs;
  // every glyph after that reuses the LAST advance (monospaced tails).
  font->advances.resize(size_t(numGlyphs));
  int32_t lastAdvance = 0;
  for (int32_t g = 0; g < numGlyphs; g++) {
    if (g < numberOfHMetrics) lastAdvance = u16(dv, hmtx->second.offset + int64_t(g) * 4);
    font->advances[size_t(g)] = uint16_t(lastAdvance);
  }

  font->cmapLookup = parseCmap(dv, cmap->second.offset);

  // Optional kerning sources — never fatal.
  font->gposKern = nullptr;
  const auto gposEntry = tables.find("GPOS");
  if (gposEntry != tables.end()) {
    try {
      font->gposKern = parseGposKern(dv, gposEntry->second.offset);
    } catch (...) {
      font->gposKern = nullptr;  // malformed GPOS -> just no kerning from it
    }
  }
  font->kernPairs = std::nullopt;
  if (font->gposKern == nullptr) {
    const auto kernEntry = tables.find("kern");
    if (kernEntry != tables.end()) {
      try {
        font->kernPairs = parseKern(dv, kernEntry->second.offset, kernEntry->second.length);
      } catch (...) {
        font->kernPairs = std::nullopt;
      }
    }
  }

  font->unitsPerEm = unitsPerEm;
  font->ascender = ascender;
  font->descender = descender;
  font->lineGap = lineGap;
  font->numGlyphs = numGlyphs;
  return font;
}

}  // namespace pretext::fonts
