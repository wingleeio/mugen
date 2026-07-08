// PreparedRichInlineObject.cpp — see header. Compiles only within the RN build.
#include "PreparedRichInlineObject.hpp"

#include <utility>
#include <vector>

#include "LayoutCursor.hpp"
#include "LineStatsSpec.hpp"
#include "RichInlineCursorSpec.hpp"
#include "RichInlineFragmentSpec.hpp"
#include "RichInlineLineSpec.hpp"
#include "RichWalkResultSpec.hpp"
#include "jsi_convert.hpp"
#include "pretext/rich_inline.hpp"

namespace margelo::nitro::pretextcore {

RichWalkResultSpec PreparedRichInlineObject::walk(double maxWidth) {
  // Collect the line ranges first, then materialize each into fragment text.
  std::vector<pretext::RichInlineLineRange> ranges;
  int32_t lineCount = pretext::walkRichInlineLineRanges(
      *prepared_, maxWidth,
      [&](const pretext::RichInlineLineRange& range) { ranges.push_back(range); });

  std::vector<RichInlineLineSpec> lines;
  lines.reserve(ranges.size());
  for (const auto& range : ranges) {
    pretext::RichInlineLine line =
        pretext::materializeRichInlineLineRange(*prepared_, range);

    std::vector<RichInlineFragmentSpec> fragments;
    fragments.reserve(line.fragments.size());
    for (const auto& f : line.fragments) {
      fragments.emplace_back(
          static_cast<double>(f.itemIndex), ptcjsi::u16ToU8(f.text),
          f.gapBefore, f.occupiedWidth,
          LayoutCursor(static_cast<double>(f.start.segmentIndex),
                       static_cast<double>(f.start.graphemeIndex)),
          LayoutCursor(static_cast<double>(f.end.segmentIndex),
                       static_cast<double>(f.end.graphemeIndex)));
    }

    RichInlineCursorSpec end(static_cast<double>(line.end.itemIndex),
                             static_cast<double>(line.end.segmentIndex),
                             static_cast<double>(line.end.graphemeIndex));
    lines.emplace_back(std::move(fragments), line.width, end);
  }

  return RichWalkResultSpec(static_cast<double>(lineCount), std::move(lines));
}

LineStatsSpec PreparedRichInlineObject::stats(double maxWidth) {
  pretext::RichInlineStats r =
      pretext::measureRichInlineStats(*prepared_, maxWidth);
  return LineStatsSpec(static_cast<double>(r.lineCount), r.maxLineWidth);
}

}  // namespace margelo::nitro::pretextcore
