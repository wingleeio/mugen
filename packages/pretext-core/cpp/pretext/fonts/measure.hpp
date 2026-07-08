// Port of packages/pretext-native/src/engine/measure.ts
// The advance ruler: summed per-code-point advances + same-face pair kerning,
// font units scaled to px; emoji fallback = emojiAdvanceEm * sizePx;
// VS16/ZWJ/skin-tone modifiers are zero-width and kerning-transparent.
#pragma once

#include <string>

namespace pretext::fonts {

void setEmojiAdvanceEm(double value);

// Mirrors measureTextWidth(text, font). Throws when no registered font
// matches the shorthand (same message semantics as TS).
double measureTextWidth(const std::u16string& text, const std::u16string& font);

void clearResolvedFontCache();

}  // namespace pretext::fonts
