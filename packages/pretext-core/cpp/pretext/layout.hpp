// Port of @chenglou/pretext@0.0.8 src/layout.ts — the public engine API.
#pragma once

#include <functional>
#include <string>

#include "types.hpp"

namespace pretext {

PreparedPtr prepare(const std::u16string& text, const std::u16string& font,
                    const PrepareOptions& options = {});

PreparedPtr prepareWithSegments(const std::u16string& text,
                                const std::u16string& font,
                                const PrepareOptions& options = {});

LayoutResult layout(const Prepared& prepared, double maxWidth, double lineHeight);

LayoutLinesResult layoutWithLines(const Prepared& prepared, double maxWidth,
                                  double lineHeight);

int32_t walkLineRanges(const Prepared& prepared, double maxWidth,
                       const std::function<void(const LayoutLineRange&)>& onLine);

LayoutLine materializeLineRange(const Prepared& prepared, const LayoutLineRange& line);

LineStats measureLineStats(const Prepared& prepared, double maxWidth);

double measureNaturalWidth(const Prepared& prepared);

// TS: LayoutLine | null → std::optional
std::optional<LayoutLine> layoutNextLine(const Prepared& prepared,
                                         const LayoutCursor& start, double maxWidth);

std::optional<LayoutLineRange> layoutNextLineRange(const Prepared& prepared,
                                                   const LayoutCursor& start,
                                                   double maxWidth);

void clearCache();

}  // namespace pretext
