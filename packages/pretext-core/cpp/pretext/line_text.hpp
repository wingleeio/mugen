// Port of @chenglou/pretext@0.0.8 src/line-text.ts
// Materializes line text from segment/grapheme ranges. The per-prepared
// grapheme cache lives on Prepared::lineTextCache (TS uses a WeakMap).
#pragma once

#include <string>

#include "types.hpp"

namespace pretext {

std::u16string buildLineTextFromRange(const Prepared& prepared,
                                      int32_t startSegmentIndex,
                                      int32_t startGraphemeIndex,
                                      int32_t endSegmentIndex,
                                      int32_t endGraphemeIndex);

// clearLineTextCaches() is a no-op placeholder (caches live on handles).
void clearLineTextCaches();

}  // namespace pretext
