// Port of @chenglou/pretext@0.0.8 src/measurement.ts
// Per-font segment metric caches over fonts::measureTextWidth (which replaces
// ctx.measureText — see PORTING.md rule 4). emojiCorrection ≡ 0 on native.
#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "types.hpp"

namespace pretext {

using SegmentMetricCache = std::unordered_map<std::u16string, SegmentMetrics>;

// Mirrors getSegmentMetricCache(font). Reference stays valid until
// clearMeasurementCaches().
SegmentMetricCache& getSegmentMetricCache(const std::u16string& font);

// Mirrors getSegmentMetrics(seg, cache) — measures via
// fonts::measureTextWidth(seg, font). The font is bound per-cache; see
// FontMeasurementState below (the TS version binds ctx.font globally).
SegmentMetrics& getSegmentMetrics(const std::u16string& seg,
                                  SegmentMetricCache& cache,
                                  const std::u16string& font);

// getEngineProfile() → kNativeEngineProfile (constant on native).
inline const EngineProfile& getEngineProfile() { return kNativeEngineProfile; }

double parseFontSize(const std::u16string& font);

// getCorrectedSegmentWidth(seg, metrics, 0) — passthrough on native.
inline double getCorrectedSegmentWidth(const SegmentMetrics& metrics) {
  return metrics.width;
}

// Mirrors getSegmentBreakableFitAdvances(seg, metrics, cache, 0, mode).
// Returns nullptr-like nullopt for single-grapheme segments.
const std::optional<std::vector<double>>& getSegmentBreakableFitAdvances(
    const std::u16string& seg,
    SegmentMetrics& metrics,
    SegmentMetricCache& cache,
    const std::u16string& font,
    BreakableFitMode mode);

struct FontMeasurementState {
  SegmentMetricCache* cache;
  double fontSize;
  // emojiCorrection omitted — always 0 on native.
};

// Mirrors getFontMeasurementState(font, needsEmojiCorrection=false).
FontMeasurementState getFontMeasurementState(const std::u16string& font);

void clearMeasurementCaches();

}  // namespace pretext
