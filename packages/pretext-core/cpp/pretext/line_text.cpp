// Port of @chenglou/pretext@0.0.8 src/line-text.ts
// Materializes line text from segment/grapheme ranges. The TS WeakMap of
// per-prepared grapheme caches (sharedLineTextCaches/getLineTextCache) lives
// directly on the handle as Prepared::lineTextCache; the shared grapheme
// segmenter is the stateless pretext::seg port.

#include "line_text.hpp"

#include <unordered_map>
#include <utility>
#include <vector>

#include "segmenter/grapheme.hpp"

namespace pretext {

namespace {

const std::vector<std::u16string>& getSegmentGraphemes(
    int32_t segmentIndex,
    const std::vector<std::u16string>& segments,
    std::unordered_map<int32_t, std::vector<std::u16string>>& cache) {
  auto it = cache.find(segmentIndex);
  if (it != cache.end()) return it->second;

  std::vector<std::u16string> graphemes =
      seg::splitGraphemes(segments[segmentIndex]);
  return cache.emplace(segmentIndex, std::move(graphemes)).first->second;
}

bool lineHasDiscretionaryHyphen(const std::vector<SegmentBreakKind>& kinds,
                                int32_t startSegmentIndex,
                                int32_t endSegmentIndex) {
  return endSegmentIndex > startSegmentIndex &&
         kinds[endSegmentIndex - 1] == SegmentBreakKind::SoftHyphen;
}

// TS returns the grown string; appending in place builds the identical text.
void appendSegmentGraphemeRange(std::u16string& text,
                                const std::vector<std::u16string>& graphemes,
                                int32_t startGraphemeIndex,
                                int32_t endGraphemeIndex) {
  for (int32_t i = startGraphemeIndex; i < endGraphemeIndex; i++) {
    text += graphemes[i];
  }
}

}  // namespace

std::u16string buildLineTextFromRange(const Prepared& prepared,
                                      int32_t startSegmentIndex,
                                      int32_t startGraphemeIndex,
                                      int32_t endSegmentIndex,
                                      int32_t endGraphemeIndex) {
  // TS getLineTextCache(prepared): the cache lives on the handle here.
  auto& cache = prepared.lineTextCache;

  std::u16string text;
  const bool endsWithDiscretionaryHyphen = lineHasDiscretionaryHyphen(
      prepared.kinds, startSegmentIndex, endSegmentIndex);

  for (int32_t i = startSegmentIndex; i < endSegmentIndex; i++) {
    if (prepared.kinds[i] == SegmentBreakKind::SoftHyphen ||
        prepared.kinds[i] == SegmentBreakKind::HardBreak) {
      continue;
    }
    if (i == startSegmentIndex && startGraphemeIndex > 0) {
      const std::vector<std::u16string>& graphemes =
          getSegmentGraphemes(i, prepared.segments, cache);
      appendSegmentGraphemeRange(text, graphemes, startGraphemeIndex,
                                 static_cast<int32_t>(graphemes.size()));
    } else {
      text += prepared.segments[i];
    }
  }

  if (endGraphemeIndex > 0) {
    if (endsWithDiscretionaryHyphen) text += u'-';
    const std::vector<std::u16string>& graphemes =
        getSegmentGraphemes(endSegmentIndex, prepared.segments, cache);
    appendSegmentGraphemeRange(
        text, graphemes,
        startSegmentIndex == endSegmentIndex ? startGraphemeIndex : 0,
        endGraphemeIndex);
  } else if (endsWithDiscretionaryHyphen) {
    text += u'-';
  }

  return text;
}

void clearLineTextCaches() {
  // TS resets sharedGraphemeSegmenter and the WeakMap of caches. On native the
  // segmenter is stateless and each cache lives on its Prepared handle (freed
  // with it), so there is no module-level state to clear.
}

}  // namespace pretext
