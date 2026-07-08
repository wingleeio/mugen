// Port of packages/pretext-native/src/engine/measure.ts
//
// The measurement core: canvas-measureText semantics reconstructed from font
// tables. pretext feeds strings through ctx.measureText(str).width; we answer
// with summed advance widths + pair kerning, scaled from font units to px.

#include "measure.hpp"

#include <memory>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

#include "../types.hpp"
#include "registry.hpp"
#include "shorthand.hpp"

namespace pretext::fonts {

namespace {

// UTF-16 -> UTF-8 for the "no registered font" error message.
std::string toUtf8(const std::u16string& s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    char32_t cp = s[i];
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.size()) {
      char16_t d = s[i + 1];
      if (d >= 0xDC00 && d <= 0xDFFF) {
        cp = (char32_t(cp - 0xD800) << 10) + (d - 0xDC00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      out.push_back(char(cp));
    } else if (cp < 0x800) {
      out.push_back(char(0xC0 | (cp >> 6)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
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

// --- emoji fallback -----------------------------------------------------------

// Font files rarely cover emoji; assume the platform emoji font's near-universal
// metric of one em square per emoji. Configurable per platform.
double& emojiAdvanceEm() {
  static double v = 1.0;
  return v;
}

bool isEmojiish(char32_t cp) {
  // Coarse Extended-Pictographic check.
  return (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf);
}

bool isZeroWidthEmojiJoiner(char32_t cp) {
  // VS16, ZWJ, and skin-tone modifiers render as modifications of the
  // preceding emoji, never as their own advance.
  return cp == 0xfe0f || cp == 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff);
}

// --- per-shorthand resolution cache --------------------------------------------

struct CpEntry {
  FacePtr face;  // null => emoji fallback (no glyph, no kerning)
  int32_t glyph = 0;
  double advancePx = 0;
};

struct ResolvedFont {
  std::vector<FacePtr> faces;
  double sizePx = 0;
  // code point -> resolved face/glyph/advance.
  std::unordered_map<char32_t, CpEntry> cpCache;
};

std::unordered_map<std::u16string, ResolvedFont>& resolvedCacheMap() {
  static std::unordered_map<std::u16string, ResolvedFont> m;
  return m;
}

// Any registration/generic-mapping change can alter which face a family
// resolves to, so drop everything. Subscribed lazily but exactly once, before
// any entry can be cached (all inserts go through resolveShorthand).
void ensureSubscribed() {
  static bool once = []() {
    onRegistryChange([]() { resolvedCacheMap().clear(); });
    return true;
  }();
  (void)once;
}

ResolvedFont& resolveShorthand(const std::u16string& font) {
  ensureSubscribed();
  auto& cache = resolvedCacheMap();
  auto cached = cache.find(font);
  if (cached != cache.end()) return cached->second;

  const ParsedShorthand& parsed = parseFontShorthand(font);
  std::vector<FacePtr> faces;
  for (const std::u16string& family : parsed.families) {
    FacePtr face = resolveFace(family, parsed.style, parsed.weight);
    // Skip unregistered families rather than failing: CSS-style fallback
    // means later families in the list still get their shot.
    if (face != nullptr) {
      bool includes = false;
      for (const FacePtr& f : faces) {
        if (f == face) {
          includes = true;
          break;
        }
      }
      if (!includes) faces.push_back(face);
    }
  }
  if (faces.empty()) {
    std::string tried;
    for (size_t i = 0; i < parsed.families.size(); i++) {
      if (i > 0) tried += ", ";
      tried += toUtf8(parsed.families[i]);
    }
    throw std::runtime_error(
        "pretext-native: no registered font matches \"" + toUtf8(font) +
        "\" (families tried: " + tried +
        "). Call registerFont({ family, data }) with the font binary before "
        "measuring, and setGenericFontFamily() if the shorthand only names a "
        "generic family.");
  }

  ResolvedFont resolved;
  resolved.faces = std::move(faces);
  resolved.sizePx = parsed.sizePx;
  auto res = cache.emplace(font, std::move(resolved));
  return res.first->second;
}

CpEntry& resolveCodePoint(ResolvedFont& rf, char32_t cp) {
  auto cached = rf.cpCache.find(cp);
  if (cached != rf.cpCache.end()) return cached->second;

  CpEntry entry;
  bool found = false;
  // CSS font fallback: first family in the list whose cmap covers the code
  // point wins. Glyph 0 means "unmapped" in every cmap format we parse.
  for (const FacePtr& face : rf.faces) {
    int32_t glyph = face->font->glyphForCodePoint(cp);
    if (glyph != 0) {
      entry.face = face;
      entry.glyph = glyph;
      entry.advancePx =
          (face->font->advanceForGlyph(glyph) * rf.sizePx) / face->font->unitsPerEm;
      found = true;
      break;
    }
  }
  if (!found) {
    if (isEmojiish(cp)) {
      entry.face = nullptr;
      entry.glyph = 0;
      entry.advancePx = emojiAdvanceEm() * rf.sizePx;
    } else {
      // Unmapped non-emoji: browsers render .notdef, so measure .notdef of the
      // primary face.
      const FacePtr& primary = rf.faces[0];
      entry.face = primary;
      entry.glyph = 0;
      entry.advancePx =
          (primary->font->advanceForGlyph(0) * rf.sizePx) / primary->font->unitsPerEm;
    }
  }
  auto res = rf.cpCache.emplace(cp, entry);
  return res.first->second;
}

}  // namespace

void setEmojiAdvanceEm(double value) {
  emojiAdvanceEm() = value;
  resolvedCacheMap().clear();  // cached advances baked in the old value
}

double measureTextWidth(const std::u16string& text, const std::u16string& font) {
  ResolvedFont& rf = resolveShorthand(font);
  double width = 0;
  FacePtr prevFace = nullptr;
  int32_t prevGlyph = 0;

  for (size_t i = 0; i < text.size();) {
    char32_t cp = codePointAt(text, i);
    i += cp > 0xffff ? 2 : 1;

    if (isZeroWidthEmojiJoiner(cp)) {
      // Zero width, and transparent to the kerning chain.
      continue;
    }

    CpEntry& entry = resolveCodePoint(rf, cp);
    if (entry.face != nullptr && entry.face == prevFace && prevGlyph != 0 &&
        entry.glyph != 0) {
      width += (entry.face->font->kerningForPair(prevGlyph, entry.glyph) *
                rf.sizePx) /
               entry.face->font->unitsPerEm;
    }
    width += entry.advancePx;
    prevFace = entry.face;
    prevGlyph = entry.glyph;
  }
  return width;
}

void clearResolvedFontCache() { resolvedCacheMap().clear(); }

}  // namespace pretext::fonts
