// PreparedTextObject.cpp — see header. Compiles only within the RN build.
#include "PreparedTextObject.hpp"

#include <utility>
#include <vector>

#include "LayoutCursor.hpp"
#include "LayoutLineSpec.hpp"
#include "LayoutLinesResultSpec.hpp"
#include "LayoutResultSpec.hpp"
#include "LineStatsSpec.hpp"
#include "jsi_convert.hpp"
#include "pretext/layout.hpp"

namespace margelo::nitro::pretextcore {

LayoutResultSpec PreparedTextObject::layout(double maxWidth, double lineHeight) {
  pretext::LayoutResult r = pretext::layout(*prepared_, maxWidth, lineHeight);
  return LayoutResultSpec(static_cast<double>(r.lineCount), r.height);
}

LayoutLinesResultSpec PreparedTextObject::layoutWithLines(double maxWidth,
                                                          double lineHeight) {
  pretext::LayoutLinesResult r =
      pretext::layoutWithLines(*prepared_, maxWidth, lineHeight);
  std::vector<LayoutLineSpec> lines;
  lines.reserve(r.lines.size());
  for (const auto& l : r.lines) {
    lines.emplace_back(
        pretextcore::u16ToU8(l.text), l.width,
        LayoutCursor(static_cast<double>(l.start.segmentIndex),
                     static_cast<double>(l.start.graphemeIndex)),
        LayoutCursor(static_cast<double>(l.end.segmentIndex),
                     static_cast<double>(l.end.graphemeIndex)));
  }
  return LayoutLinesResultSpec(static_cast<double>(r.lineCount), r.height,
                               std::move(lines));
}

LineStatsSpec PreparedTextObject::measureLineStats(double maxWidth) {
  pretext::LineStats r = pretext::measureLineStats(*prepared_, maxWidth);
  return LineStatsSpec(static_cast<double>(r.lineCount), r.maxLineWidth);
}

double PreparedTextObject::naturalWidth() {
  return pretext::measureNaturalWidth(*prepared_);
}

}  // namespace margelo::nitro::pretextcore
