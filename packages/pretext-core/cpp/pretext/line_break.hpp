// Port of @chenglou/pretext@0.0.8 src/line-break.ts
// The greedy line walker (simple fast path + chunked full path with pre-wrap
// tabs, soft hyphens, letter-spacing, breakable segments).
#pragma once

#include <cstdint>

#include "types.hpp"

namespace pretext {

// PreparedLineBreakData is a structural subset of Prepared — pass Prepared.
// LineBreakCursor == LayoutCursor.

// Returns chunk index, or -1. Mutates cursor like the TS version.
int32_t normalizePreparedLineStart(const Prepared& prepared, LayoutCursor& cursor);

int32_t countPreparedLines(const Prepared& prepared, double maxWidth);

// onLine may be null (count-only walk).
int32_t walkPreparedLinesRaw(const Prepared& prepared, double maxWidth,
                             const InternalLineVisitor* onLine);

// Returns line width or nullopt (TS: number | null). Mutates cursor.
std::optional<double> stepPreparedLineGeometryFromChunk(const Prepared& prepared,
                                                        LayoutCursor& cursor,
                                                        int32_t chunkIndex,
                                                        double maxWidth);

std::optional<double> stepPreparedLineGeometry(const Prepared& prepared,
                                               LayoutCursor& cursor,
                                               double maxWidth);

LineStats measurePreparedLineGeometry(const Prepared& prepared, double maxWidth);

}  // namespace pretext
