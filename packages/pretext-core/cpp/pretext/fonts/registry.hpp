// Port of packages/pretext-native/src/engine/registry.ts
#pragma once

#include <cstdint>

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "sfnt.hpp"
#include "shorthand.hpp"

namespace pretext::fonts {

struct Face {
  std::u16string family;
  double weight = 400;
  FontStyle style = FontStyle::Normal;
  ParsedFontPtr font;
};

using FacePtr = std::shared_ptr<Face>;

struct RegisterFontOptions {
  std::u16string family;
  double weight = 400;              // keywords normalized by caller-facing API
  FontStyle style = FontStyle::Normal;
  const uint8_t* data = nullptr;
  size_t size = 0;
};

struct ParsedFontInfo {
  std::u16string family;
  double weight;
  FontStyle style;
  int32_t unitsPerEm;
  int32_t numGlyphs;
};

void onRegistryChange(std::function<void()> listener);
void registerFont(const RegisterFontOptions& options);
void clearRegisteredFonts();
std::vector<ParsedFontInfo> getRegisteredFonts();
// generic: "sans-serif" | "serif" | "monospace" | "system-ui" (validated like TS)
void setGenericFontFamily(const std::u16string& generic, const std::u16string& family);
// nullopt-like: empty string means null.
std::u16string resolveGenericFontFamily(const std::u16string& name);
FacePtr resolveFace(const std::u16string& familyName, FontStyle style, double weight);

}  // namespace pretext::fonts
