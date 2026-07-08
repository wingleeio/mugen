// Port of @chenglou/pretext@0.0.8 src/measurement.ts
// Text measurement over fonts::measureTextWidth (which replaces canvas
// ctx.measureText — see PORTING.md rule 4). emojiCorrection ≡ 0 on native, so
// getMeasureContext/getEmojiCorrection/countEmojiGraphemes/textMayContainEmoji
// are not ported; getCorrectedSegmentWidth is the inline passthrough in the
// header. getEngineProfile() is the inline kNativeEngineProfile accessor.

#include "measurement.hpp"

#include <cstdlib>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "analysis.hpp"
#include "fonts/measure.hpp"
#include "segmenter/grapheme.hpp"

namespace pretext {

namespace {

// TS: const segmentMetricCaches = new Map<string, Map<string, SegmentMetrics>>()
std::unordered_map<std::u16string, SegmentMetricCache>& segmentMetricCaches() {
  static std::unordered_map<std::u16string, SegmentMetricCache> caches;
  return caches;
}

// Safari's prefix-fit policy is useful for ordinary word-sized runs, but letting
// it measure every growing prefix of a giant segment recreates a pathological
// superlinear prepare-time path. Past this size, switch to the cheaper
// pair-context model and keep the public behavior linear.
constexpr size_t MAX_PREFIX_FIT_GRAPHEMES = 96;

}  // namespace

SegmentMetricCache& getSegmentMetricCache(const std::u16string& font) {
  auto& caches = segmentMetricCaches();
  auto it = caches.find(font);
  if (it == caches.end()) {
    it = caches.emplace(font, SegmentMetricCache{}).first;
  }
  return it->second;
}

SegmentMetrics& getSegmentMetrics(const std::u16string& seg,
                                  SegmentMetricCache& cache,
                                  const std::u16string& font) {
  auto it = cache.find(seg);
  if (it == cache.end()) {
    SegmentMetrics metrics;
    // TS: ctx.measureText(seg).width — pretext-native's shim is exactly this.
    metrics.width = fonts::measureTextWidth(seg, font);
    metrics.containsCJK = isCJK(seg);
    it = cache.emplace(seg, std::move(metrics)).first;
  }
  return it->second;
}

namespace {

// JS regex \s character class (for /(\d+(?:\.\d+)?)\s*px/).
bool isJsRegexWhitespace(char16_t c) {
  switch (c) {
    case 0x0009:  // \t
    case 0x000A:  // \n
    case 0x000B:  // \v
    case 0x000C:  // \f
    case 0x000D:  // \r
    case 0x0020:  // space
    case 0x00A0:
    case 0x1680:
    case 0x2028:
    case 0x2029:
    case 0x202F:
    case 0x205F:
    case 0x3000:
    case 0xFEFF:
      return true;
    default:
      return c >= 0x2000 && c <= 0x200A;
  }
}

bool isAsciiDigit(char16_t c) { return c >= u'0' && c <= u'9'; }

}  // namespace

double parseFontSize(const std::u16string& font) {
  // TS: const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  //     return m ? parseFloat(m[1]!) : 16
  // Ported as a manual scan with JS regex semantics: attempt a match at every
  // start index; greedy \d+ / (?:\.\d+)? / \s* never need to backtrack here
  // (no shorter quantifier match can succeed when the greedy one fails, since
  // digits are not '.', not \s, and not 'p').
  const size_t n = font.size();
  for (size_t i = 0; i < n; i++) {
    if (!isAsciiDigit(font[i])) continue;
    size_t j = i;
    while (j < n && isAsciiDigit(font[j])) j++;
    size_t k = j;
    if (k + 1 < n && font[k] == u'.' && isAsciiDigit(font[k + 1])) {
      k += 2;
      while (k < n && isAsciiDigit(font[k])) k++;
    }
    size_t m = k;
    while (m < n && isJsRegexWhitespace(font[m])) m++;
    if (m + 1 < n && font[m] == u'p' && font[m + 1] == u'x') {
      // Capture group 1 is ASCII digits + optional '.': parseFloat == strtod.
      std::string number;
      number.reserve(k - i);
      for (size_t p = i; p < k; p++) number.push_back(static_cast<char>(font[p]));
      return std::strtod(number.c_str(), nullptr);
    }
  }
  return 16;
}

const std::optional<std::vector<double>>& getSegmentBreakableFitAdvances(
    const std::u16string& seg,
    SegmentMetrics& metrics,
    SegmentMetricCache& cache,
    const std::u16string& font,
    BreakableFitMode mode) {
  // TS: if (metrics.breakableFitAdvances !== undefined && metrics.breakableFitMode === mode)
  if (metrics.hasBreakableFit && metrics.breakableFitMode == mode) {
    return metrics.breakableFitAdvances;
  }
  metrics.breakableFitMode = mode;

  const std::vector<std::u16string> graphemes = seg::splitGraphemes(seg);
  if (graphemes.size() <= 1) {
    // TS: metrics.breakableFitAdvances = null
    metrics.breakableFitAdvances = std::nullopt;
    metrics.hasBreakableFit = true;
    return metrics.breakableFitAdvances;
  }

  if (mode == BreakableFitMode::SumGraphemes) {
    std::vector<double> advances;
    for (const std::u16string& grapheme : graphemes) {
      const SegmentMetrics& graphemeMetrics = getSegmentMetrics(grapheme, cache, font);
      advances.push_back(getCorrectedSegmentWidth(graphemeMetrics));
    }
    metrics.breakableFitAdvances = std::move(advances);
    metrics.hasBreakableFit = true;
    return metrics.breakableFitAdvances;
  }

  if (mode == BreakableFitMode::PairContext || graphemes.size() > MAX_PREFIX_FIT_GRAPHEMES) {
    std::vector<double> advances;
    bool hasPreviousGrapheme = false;  // TS: previousGrapheme: string | null
    std::u16string previousGrapheme;
    double previousWidth = 0;

    for (const std::u16string& grapheme : graphemes) {
      const SegmentMetrics& graphemeMetrics = getSegmentMetrics(grapheme, cache, font);
      const double currentWidth = getCorrectedSegmentWidth(graphemeMetrics);

      if (!hasPreviousGrapheme) {
        advances.push_back(currentWidth);
      } else {
        const std::u16string pair = previousGrapheme + grapheme;
        const SegmentMetrics& pairMetrics = getSegmentMetrics(pair, cache, font);
        advances.push_back(getCorrectedSegmentWidth(pairMetrics) - previousWidth);
      }

      hasPreviousGrapheme = true;
      previousGrapheme = grapheme;
      previousWidth = currentWidth;
    }

    metrics.breakableFitAdvances = std::move(advances);
    metrics.hasBreakableFit = true;
    return metrics.breakableFitAdvances;
  }

  std::vector<double> advances;
  std::u16string prefix;
  double prefixWidth = 0;

  for (const std::u16string& grapheme : graphemes) {
    prefix += grapheme;
    const SegmentMetrics& prefixMetrics = getSegmentMetrics(prefix, cache, font);
    const double nextPrefixWidth = getCorrectedSegmentWidth(prefixMetrics);
    advances.push_back(nextPrefixWidth - prefixWidth);
    prefixWidth = nextPrefixWidth;
  }

  metrics.breakableFitAdvances = std::move(advances);
  metrics.hasBreakableFit = true;
  return metrics.breakableFitAdvances;
}

FontMeasurementState getFontMeasurementState(const std::u16string& font) {
  // TS also does ctx.font = font here; on native the font travels with each
  // measure call instead. needsEmojiCorrection is always false on native.
  FontMeasurementState state;
  state.cache = &getSegmentMetricCache(font);
  state.fontSize = parseFontSize(font);
  return state;
}

void clearMeasurementCaches() {
  segmentMetricCaches().clear();
  // TS also clears emojiCorrectionCache and sharedGraphemeSegmenter — neither
  // exists on native (emojiCorrection ≡ 0; the segmenter is stateless).
}

}  // namespace pretext
