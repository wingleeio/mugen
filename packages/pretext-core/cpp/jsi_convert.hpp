// jsi_convert.hpp — JS-faithful UTF-8 <-> UTF-16 conversions plus the small
// string→enum mappings the Nitro HybridObjects need to hand JSI values to the
// pretext kernel.
//
// The u8ToU16/u16ToU8 logic is copied verbatim from
// tools/fixture-runner/main.cpp (toU16/toU8) so the JSI bridge and the
// conformance runner agree byte-for-byte.
//
// This header is standalone C++20 (kernel headers only) and is exercised by
// the /tmp/kernel_shim.cpp smoke test. It carries no NitroModules dependency so
// it also compiles inside the RN build.
#pragma once

#include <cstdint>

#include <string>

#include "pretext/fonts/shorthand.hpp"  // pretext::fonts::FontStyle
#include "pretext/types.hpp"            // pretext::codePointAt/codePointLen, modes

namespace ptcjsi {

// --- UTF-8 <-> UTF-16 (JS-faithful) ---
// Mirrors tools/fixture-runner/main.cpp toU16/toU8 exactly.

inline std::u16string u8ToU16(const std::string& utf8) {
  std::u16string out;
  out.reserve(utf8.size());
  size_t i = 0;
  while (i < utf8.size()) {
    uint8_t c = utf8[i];
    char32_t cp;
    size_t len;
    if (c < 0x80) {
      cp = c;
      len = 1;
    } else if ((c >> 5) == 0x6) {
      cp = c & 0x1F;
      len = 2;
    } else if ((c >> 4) == 0xE) {
      cp = c & 0x0F;
      len = 3;
    } else {
      cp = c & 0x07;
      len = 4;
    }
    for (size_t k = 1; k < len && i + k < utf8.size(); k++) {
      cp = (cp << 6) | (uint8_t(utf8[i + k]) & 0x3F);
    }
    i += len;
    if (cp > 0xFFFF) {
      cp -= 0x10000;
      out.push_back(char16_t(0xD800 + (cp >> 10)));
      out.push_back(char16_t(0xDC00 + (cp & 0x3FF)));
    } else {
      out.push_back(char16_t(cp));
    }
  }
  return out;
}

inline std::string u16ToU8(const std::u16string& s) {
  std::string out;
  out.reserve(s.size() * 3);
  size_t i = 0;
  while (i < s.size()) {
    char32_t cp = pretext::codePointAt(s, i);
    i += pretext::codePointLen(cp);
    if (cp < 0x80) {
      out.push_back(char(cp));
    } else if (cp < 0x800) {
      out.push_back(char(0xC0 | (cp >> 6)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      // Lone surrogates would be invalid UTF-8; emit U+FFFD to keep output
      // well-formed (JS String→UTF-8 does the same for lone surrogates).
      if (cp >= 0xD800 && cp <= 0xDFFF) cp = 0xFFFD;
      out.push_back(char(0xE0 | (cp >> 12)));
      out.push_back(char(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(char(0xF0 | (cp >> 18)));
      out.push_back(char(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(char(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    }
  }
  return out;
}

// --- string → enum mappings (UTF-8 keys straight off JSI) ---

inline pretext::fonts::FontStyle fontStyleFromString(const std::string& style) {
  if (style == "italic") return pretext::fonts::FontStyle::Italic;
  if (style == "oblique") return pretext::fonts::FontStyle::Oblique;
  return pretext::fonts::FontStyle::Normal;
}

inline pretext::WhiteSpaceMode whiteSpaceModeFromString(const std::string& mode) {
  if (mode == "pre-wrap") return pretext::WhiteSpaceMode::PreWrap;
  return pretext::WhiteSpaceMode::Normal;
}

inline pretext::WordBreakMode wordBreakModeFromString(const std::string& mode) {
  if (mode == "keep-all") return pretext::WordBreakMode::KeepAll;
  return pretext::WordBreakMode::Normal;
}

}  // namespace ptcjsi
