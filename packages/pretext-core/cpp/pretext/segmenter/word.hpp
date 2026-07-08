// Port of packages/pretext-native/src/segmenter/word.ts
// Word-granularity segmentation, Intl-alike (see that file's header comment
// for the deliberate UAX#29 simplifications — keep them identical).
#pragma once

#include <string>
#include <vector>

#include "../types.hpp"

namespace pretext::seg {

struct WordSegment {
  std::u16string segment;
  int32_t index = 0; // UTF-16 start index
  bool isWordLike = false;
};

// Mirrors iterateWords(text) — materialized instead of a generator.
std::vector<WordSegment> iterateWords(const std::u16string& text);

}  // namespace pretext::seg
