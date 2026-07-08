// Port of packages/pretext-native/src/engine/registry.ts
//
// Font registry: the app registers the font binaries it ships (the same TTFs
// it hands to React Native's font loader), and measurement resolves canvas
// font shorthands against them. There is no system-font discovery on
// purpose — Hermes gives us no way to read platform font files, so anything
// measurable must be registered explicitly. That's also what keeps
// measurement deterministic across iOS/Android.

#include "registry.hpp"

#include <cmath>
#include <string>
#include <unordered_map>
#include <vector>

namespace pretext::fonts {

namespace {

// JS String.prototype.toLowerCase, restricted to ASCII A-Z; non-ASCII code
// units are left unchanged (see PORTING report note). Family keys are ASCII in
// practice.
std::u16string asciiLower(const std::u16string& s) {
  std::u16string out = s;
  for (char16_t& c : out) {
    if (c >= u'A' && c <= u'Z') c = char16_t(c + 32);
  }
  return out;
}

// family (lowercased) -> registered faces. Faces are small, so we keep every
// registered variant and pick at resolve time.
std::unordered_map<std::u16string, std::vector<FacePtr>>& registry() {
  static std::unordered_map<std::u16string, std::vector<FacePtr>> r;
  return r;
}

// 'sans-serif' etc. -> concrete family.
std::unordered_map<std::u16string, std::u16string>& genericMap() {
  static std::unordered_map<std::u16string, std::u16string> m;
  return m;
}

// GENERIC_FAMILIES = new Set(['sans-serif', 'serif', 'monospace', 'system-ui'])
bool isGenericFamily(const std::u16string& name) {
  return name == u"sans-serif" || name == u"serif" || name == u"monospace" ||
         name == u"system-ui";
}

// Resolution results are cached per shorthand string in measure.cpp; any
// registry mutation invalidates those caches via this subscription.
std::vector<std::function<void()>>& invalidationListeners() {
  static std::vector<std::function<void()>> listeners;
  return listeners;
}
void notifyChange() {
  for (const auto& listener : invalidationListeners()) listener();
}

/**
 * CSS-font-matching-lite weight selection: exact match wins; otherwise the
 * nearest weight by absolute distance, with ties broken toward the requested
 * direction (light requests prefer lighter faces, bold requests prefer
 * bolder ones).
 */
FacePtr pickByWeight(const std::vector<FacePtr>& faces, double desired) {
  FacePtr best = faces[0];
  double bestDist = std::fabs(best->weight - desired);
  for (size_t i = 1; i < faces.size(); i++) {
    const FacePtr& face = faces[i];
    double dist = std::fabs(face->weight - desired);
    if (dist < bestDist) {
      best = face;
      bestDist = dist;
    } else if (dist == bestDist && dist != 0) {
      bool preferLower = desired < 400;
      bool candidateIsLower = face->weight < best->weight;
      if (preferLower == candidateIsLower) best = face;
    }
  }
  return best;
}

}  // namespace

void onRegistryChange(std::function<void()> listener) {
  invalidationListeners().push_back(std::move(listener));
}

void registerFont(const RegisterFontOptions& options) {
  const std::u16string& family = options.family;
  // weight/style already normalized by the caller-facing API (RegisterFontOptions
  // carries a plain double / FontStyle).
  double weight = options.weight;
  FontStyle style = options.style;
  // Parse eagerly so registration is the single place a bad font file can
  // fail — measurement stays exception-free for registered fonts. parseFont
  // COPIES the borrowed bytes.
  ParsedFontPtr font = parseFont(options.data, options.size);

  std::u16string key = asciiLower(family);
  std::vector<FacePtr>& faces = registry()[key];

  // Re-registering the same (family, weight, style) replaces.
  int existing = -1;
  for (size_t i = 0; i < faces.size(); i++) {
    if (faces[i]->weight == weight && faces[i]->style == style) {
      existing = int(i);
      break;
    }
  }
  auto face = std::make_shared<Face>();
  face->family = family;
  face->weight = weight;
  face->style = style;
  face->font = font;
  if (existing >= 0)
    faces[existing] = face;
  else
    faces.push_back(face);
  notifyChange();
}

void clearRegisteredFonts() {
  registry().clear();
  genericMap().clear();
  notifyChange();
}

std::vector<ParsedFontInfo> getRegisteredFonts() {
  std::vector<ParsedFontInfo> out;
  for (const auto& entry : registry()) {
    for (const FacePtr& f : entry.second) {
      ParsedFontInfo info;
      info.family = f->family;
      info.weight = f->weight;
      info.style = f->style;
      info.unitsPerEm = f->font->unitsPerEm;
      info.numGlyphs = f->font->numGlyphs;
      out.push_back(std::move(info));
    }
  }
  return out;
}

void setGenericFontFamily(const std::u16string& generic,
                          const std::u16string& family) {
  // TS validates the generic name at the type level (GenericFamily union);
  // there is no runtime check, so we mirror the runtime behavior and simply
  // record the mapping. resolveFace only consults GENERIC_FAMILIES.
  genericMap()[generic] = family;
  notifyChange();
}

std::u16string resolveGenericFontFamily(const std::u16string& name) {
  auto it = genericMap().find(asciiLower(name));
  if (it == genericMap().end()) return std::u16string();  // null
  return it->second;
}

FacePtr resolveFace(const std::u16string& familyName, FontStyle style,
                    double weight) {
  std::u16string name = asciiLower(familyName);
  if (isGenericFamily(name)) {
    auto mapped = genericMap().find(name);
    if (mapped == genericMap().end()) return nullptr;
    name = asciiLower(mapped->second);
  }
  auto facesIt = registry().find(name);
  if (facesIt == registry().end() || facesIt->second.empty()) return nullptr;
  const std::vector<FacePtr>& faces = facesIt->second;

  // Italic/oblique fall back to each other, then to normal.
  FontStyle stylePreference[3];
  if (style == FontStyle::Normal) {
    stylePreference[0] = FontStyle::Normal;
    stylePreference[1] = FontStyle::Oblique;
    stylePreference[2] = FontStyle::Italic;
  } else if (style == FontStyle::Italic) {
    stylePreference[0] = FontStyle::Italic;
    stylePreference[1] = FontStyle::Oblique;
    stylePreference[2] = FontStyle::Normal;
  } else {  // Oblique
    stylePreference[0] = FontStyle::Oblique;
    stylePreference[1] = FontStyle::Italic;
    stylePreference[2] = FontStyle::Normal;
  }
  for (FontStyle s : stylePreference) {
    std::vector<FacePtr> candidates;
    for (const FacePtr& f : faces) {
      if (f->style == s) candidates.push_back(f);
    }
    if (!candidates.empty()) return pickByWeight(candidates, weight);
  }
  return nullptr;  // unreachable — stylePreference covers all styles
}

}  // namespace pretext::fonts
