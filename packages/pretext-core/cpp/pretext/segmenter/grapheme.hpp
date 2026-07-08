// Port of packages/pretext-native/src/segmenter/grapheme.ts
// UAX#29-alike extended grapheme cluster boundaries (the exact subset that
// module implements — port its tables/rules verbatim, not full ICU).
#pragma once

#include <cstdint>

#include <string>
#include <vector>

#include "../types.hpp"

namespace pretext::seg {

bool isExtendedPictographic(char32_t cp);

// Returns the UTF-16 index of the next grapheme boundary after `start`.
// Mirrors nextGraphemeBoundary(text, start).
int32_t nextGraphemeBoundary(const std::u16string& text, int32_t start);

struct GraphemeSegment {
  std::u16string segment;
  int32_t index = 0; // UTF-16 start index
};

// Mirrors iterateGraphemes(text) — materialized instead of a generator.
std::vector<GraphemeSegment> iterateGraphemes(const std::u16string& text);

// Convenience used widely by the kernel: grapheme strings only.
std::vector<std::u16string> splitGraphemes(const std::u16string& text);

// Grapheme count without materializing strings (letter-spacing counts).
int32_t countGraphemes(const std::u16string& text);

}  // namespace pretext::seg
