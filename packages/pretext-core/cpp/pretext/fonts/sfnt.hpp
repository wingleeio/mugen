// Port of packages/pretext-native/src/sfnt/parse.ts
// TTF/OTF/TTC table parser: head, maxp, hhea, hmtx, cmap (formats 4/6/12),
// legacy kern (MS v0 format 0), GPOS 'kern' feature PairPos 1/2 (+Extension).
// Kerning source exclusive: GPOS if present else legacy kern. No shaping.
#pragma once

#include <cstdint>
#include <memory>
#include <vector>

namespace pretext::fonts {

class ParsedFont {
 public:
  virtual ~ParsedFont() = default;

  int32_t unitsPerEm = 0;
  int32_t ascender = 0;
  int32_t descender = 0;
  int32_t lineGap = 0;
  int32_t numGlyphs = 0;

  // Code point -> glyph id. 0 (.notdef) means "not mapped".
  virtual int32_t glyphForCodePoint(char32_t codePoint) const = 0;
  // Advance width in font units for a glyph id (clamped into range).
  virtual int32_t advanceForGlyph(int32_t glyphId) const = 0;
  // Pair kerning in font units (0 when absent). Memoized like the TS
  // kernCache.
  virtual int32_t kerningForPair(int32_t left, int32_t right) const = 0;
};

using ParsedFontPtr = std::shared_ptr<ParsedFont>;

// Mirrors parseFont(data). Throws std::runtime_error on missing required
// tables (cmap/hmtx/head/hhea/maxp), zero unitsPerEm, etc. TTC → first face.
ParsedFontPtr parseFont(const uint8_t* data, size_t size);

}  // namespace pretext::fonts
