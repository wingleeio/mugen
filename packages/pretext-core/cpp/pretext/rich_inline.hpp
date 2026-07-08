// Port of @chenglou/pretext@0.0.8 src/rich-inline.ts
// Multi-item (font-run) inline layout over per-item Prepared handles.
#pragma once

#include <cstdint>

#include <functional>
#include <vector>

#include "types.hpp"

namespace pretext {

// InternalPreparedRichInline; opaque to callers, defined fully in the .cpp
// except for what the fixture-runner/JSI layer needs (item count).
struct PreparedRichInline {
  struct Impl;
  std::shared_ptr<Impl> impl;
};

PreparedRichInlinePtr prepareRichInline(const std::vector<RichInlineItem>& items);

std::optional<RichInlineLineRange> layoutNextRichInlineLineRange(
    const PreparedRichInline& prepared, double maxWidth,
    const RichInlineCursor& start = {});

RichInlineLine materializeRichInlineLineRange(const PreparedRichInline& prepared,
                                              const RichInlineLineRange& line);

int32_t walkRichInlineLineRanges(
    const PreparedRichInline& prepared, double maxWidth,
    const std::function<void(const RichInlineLineRange&)>& onLine);

RichInlineStats measureRichInlineStats(const PreparedRichInline& prepared,
                                       double maxWidth);

}  // namespace pretext
