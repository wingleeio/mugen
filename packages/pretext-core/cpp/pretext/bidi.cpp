// Port of @chenglou/pretext@0.0.8 src/bidi.ts
//
// Simplified bidi metadata helper for the rich prepareWithSegments() path,
// forked from pdf.js via Sebastian's text-layout. It classifies characters
// into bidi types, computes embedding levels, and maps them onto prepared
// segments for custom rendering. The line-breaking engine does not consume
// these levels.

#include "bidi.hpp"

#include <optional>

#include "tables/bidi_data.hpp"

namespace pretext {

using tables::BidiType;
using tables::kLatin1BidiTypes;
using tables::kNonLatin1BidiRangeCount;
using tables::kNonLatin1BidiRanges;

static BidiType classifyCodePoint(char32_t codePoint) {
  if (codePoint <= 0x00FF) return kLatin1BidiTypes[codePoint];

  int32_t lo = 0;
  int32_t hi = kNonLatin1BidiRangeCount - 1;
  while (lo <= hi) {
    const int32_t mid = (lo + hi) >> 1;
    const auto& range = kNonLatin1BidiRanges[mid];
    if (codePoint < range.start) {
      hi = mid - 1;
      continue;
    }
    if (codePoint > range.end) {
      lo = mid + 1;
      continue;
    }
    return range.type;
  }

  return BidiType::L;
}

static std::optional<std::vector<int8_t>> computeBidiLevels(const std::u16string& str) {
  const int32_t len = static_cast<int32_t>(str.size());
  if (len == 0) return std::nullopt;

  std::vector<BidiType> types(len);
  bool sawBidi = false;

  // Keep the resolved bidi classes aligned to UTF-16 code-unit offsets,
  // because the rich prepared segments index back into the normalized string
  // with JavaScript string offsets.
  for (int32_t i = 0; i < len;) {
    const char16_t first = str[i];
    char32_t codePoint = first;
    int32_t codeUnitLength = 1;

    if (first >= 0xD800 && first <= 0xDBFF && i + 1 < len) {
      const char16_t second = str[i + 1];
      if (second >= 0xDC00 && second <= 0xDFFF) {
        codePoint = (char32_t(first - 0xD800) << 10) + (second - 0xDC00) + 0x10000;
        codeUnitLength = 2;
      }
    }

    const BidiType t = classifyCodePoint(codePoint);
    if (t == BidiType::R || t == BidiType::AL || t == BidiType::AN) sawBidi = true;
    for (int32_t j = 0; j < codeUnitLength; j++) {
      types[i + j] = t;
    }
    i += codeUnitLength;
  }

  if (!sawBidi) return std::nullopt;

  // Use the first strong character to pick the paragraph base direction.
  // Rich-path bidi metadata is only an approximation, but this keeps mixed
  // LTR/RTL text aligned with the common UBA paragraph rule.
  int8_t startLevel = 0;
  for (int32_t i = 0; i < len; i++) {
    const BidiType t = types[i];
    if (t == BidiType::L) {
      startLevel = 0;
      break;
    }
    if (t == BidiType::R || t == BidiType::AL) {
      startLevel = 1;
      break;
    }
  }
  std::vector<int8_t> levels(len);
  for (int32_t i = 0; i < len; i++) levels[i] = startLevel;

  const BidiType e = (startLevel & 1) ? BidiType::R : BidiType::L;
  const BidiType sor = e;

  // W1-W7
  BidiType lastType = sor;
  for (int32_t i = 0; i < len; i++) {
    if (types[i] == BidiType::NSM) types[i] = lastType;
    else lastType = types[i];
  }
  lastType = sor;
  for (int32_t i = 0; i < len; i++) {
    const BidiType t = types[i];
    if (t == BidiType::EN) types[i] = lastType == BidiType::AL ? BidiType::AN : BidiType::EN;
    else if (t == BidiType::R || t == BidiType::L || t == BidiType::AL) lastType = t;
  }
  for (int32_t i = 0; i < len; i++) {
    if (types[i] == BidiType::AL) types[i] = BidiType::R;
  }
  for (int32_t i = 1; i < len - 1; i++) {
    if (types[i] == BidiType::ES && types[i - 1] == BidiType::EN && types[i + 1] == BidiType::EN) {
      types[i] = BidiType::EN;
    }
    if (
      types[i] == BidiType::CS &&
      (types[i - 1] == BidiType::EN || types[i - 1] == BidiType::AN) &&
      types[i + 1] == types[i - 1]
    ) {
      types[i] = types[i - 1];
    }
  }
  for (int32_t i = 0; i < len; i++) {
    if (types[i] != BidiType::EN) continue;
    int32_t j;
    for (j = i - 1; j >= 0 && types[j] == BidiType::ET; j--) types[j] = BidiType::EN;
    for (j = i + 1; j < len && types[j] == BidiType::ET; j++) types[j] = BidiType::EN;
  }
  for (int32_t i = 0; i < len; i++) {
    const BidiType t = types[i];
    if (t == BidiType::WS || t == BidiType::ES || t == BidiType::ET || t == BidiType::CS) {
      types[i] = BidiType::ON;
    }
  }
  lastType = sor;
  for (int32_t i = 0; i < len; i++) {
    const BidiType t = types[i];
    if (t == BidiType::EN) types[i] = lastType == BidiType::L ? BidiType::L : BidiType::EN;
    else if (t == BidiType::R || t == BidiType::L) lastType = t;
  }

  // N1-N2
  for (int32_t i = 0; i < len; i++) {
    if (types[i] != BidiType::ON) continue;
    int32_t end = i + 1;
    while (end < len && types[end] == BidiType::ON) end++;
    const BidiType before = i > 0 ? types[i - 1] : sor;
    const BidiType after = end < len ? types[end] : sor;
    const BidiType bDir = before != BidiType::L ? BidiType::R : BidiType::L;
    const BidiType aDir = after != BidiType::L ? BidiType::R : BidiType::L;
    if (bDir == aDir) {
      for (int32_t j = i; j < end; j++) types[j] = bDir;
    }
    i = end - 1;
  }
  for (int32_t i = 0; i < len; i++) {
    if (types[i] == BidiType::ON) types[i] = e;
  }

  // I1-I2
  for (int32_t i = 0; i < len; i++) {
    const BidiType t = types[i];
    if ((levels[i] & 1) == 0) {
      if (t == BidiType::R) levels[i]++;
      else if (t == BidiType::AN || t == BidiType::EN) levels[i] += 2;
    } else if (t == BidiType::L || t == BidiType::AN || t == BidiType::EN) {
      levels[i]++;
    }
  }

  return levels;
}

SegmentLevels computeSegmentLevels(const std::u16string& normalized,
                                   const std::vector<int32_t>& segStarts) {
  const std::optional<std::vector<int8_t>> bidiLevels = computeBidiLevels(normalized);
  if (!bidiLevels.has_value()) return SegmentLevels{};

  SegmentLevels result;
  result.hasLevels = true;
  result.levels.resize(segStarts.size());
  for (size_t i = 0; i < segStarts.size(); i++) {
    result.levels[i] = (*bidiLevels)[segStarts[i]];
  }
  return result;
}

}  // namespace pretext
