// Port of @chenglou/pretext@0.0.8 src/bidi.ts (+ src/generated/bidi-data.ts).
// Simplified per-segment bidi levels for the rich rendering path.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace pretext {

// Mirrors computeSegmentLevels(normalized, segStarts): Int8Array | null.
// Returns {hasLevels=false} when TS returns null (all-LTR fast path).
struct SegmentLevels {
  bool hasLevels = false;
  std::vector<int8_t> levels;
};

SegmentLevels computeSegmentLevels(const std::u16string& normalized,
                                   const std::vector<int32_t>& segStarts);

}  // namespace pretext
