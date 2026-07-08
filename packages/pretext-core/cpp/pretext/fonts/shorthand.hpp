// Port of packages/pretext-native/src/engine/shorthand.ts
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace pretext::fonts {

enum class FontStyle : uint8_t { Normal, Italic, Oblique };

struct ParsedShorthand {
  FontStyle style = FontStyle::Normal;
  double weight = 400;
  double sizePx = 16;
  std::vector<std::u16string> families;
};

// Mirrors parseFontShorthand(font) including its parse cache.
const ParsedShorthand& parseFontShorthand(const std::u16string& font);

void clearShorthandCache();

}  // namespace pretext::fonts
