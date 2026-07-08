// Conformance fixture runner: reads one JSON op per line on stdin, writes one
// JSON result per line on stdout. The vitest harness
// (test/conformance.test.ts) drives the TS engine over the same ops and
// compares numbers with Object.is and strings with ===.
//
// Ops:
//   {"op":"registerFont","family":"Geist","weight":400,"style":"normal","path":"/abs/font.ttf"}
//   {"op":"setGenericFontFamily","generic":"sans-serif","family":"Geist"}
//   {"op":"setEmojiAdvanceEm","value":1}
//   {"op":"measureTextWidth","text":"...","font":"16px Geist"}
//   {"op":"prepare","id":1,"text":"...","font":"16px Geist","withSegments":true,
//    "whiteSpace":"normal","wordBreak":"normal","letterSpacing":0}
//   {"op":"preparedDump","id":1}
//   {"op":"layout","id":1,"maxWidth":320,"lineHeight":24}
//   {"op":"layoutWithLines","id":1,"maxWidth":320,"lineHeight":24}
//   {"op":"measureLineStats","id":1,"maxWidth":320}
//   {"op":"naturalWidth","id":1}
//   {"op":"prepareRich","id":2,"items":[{"text":"a","font":"16px Geist",
//    "letterSpacing":0,"break":"normal","extraWidth":0},...]}
//   {"op":"walkRich","id":2,"maxWidth":320,"materialize":true}
//   {"op":"richStats","id":2,"maxWidth":320}
//   {"op":"clearCache"}

#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

#include <json.hpp>

#include "pretext/analysis.hpp"
#include "pretext/fonts/measure.hpp"
#include "pretext/fonts/registry.hpp"
#include "pretext/layout.hpp"
#include "pretext/line_break.hpp"
#include "pretext/rich_inline.hpp"

using json = nlohmann::json;

// --- UTF-8 <-> UTF-16 (JS-faithful: lone surrogates round-trip via WTF-8
// never appear from nlohmann; corpus data is valid UTF-8) ---

static std::u16string toU16(const std::string& utf8) {
  std::u16string out;
  out.reserve(utf8.size());
  size_t i = 0;
  while (i < utf8.size()) {
    uint8_t c = utf8[i];
    char32_t cp;
    size_t len;
    if (c < 0x80) { cp = c; len = 1; }
    else if ((c >> 5) == 0x6) { cp = c & 0x1F; len = 2; }
    else if ((c >> 4) == 0xE) { cp = c & 0x0F; len = 3; }
    else { cp = c & 0x07; len = 4; }
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

static std::string toU8(const std::u16string& s) {
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
      // Lone surrogates encoded as replacement-free CESU-ish bytes would be
      // invalid JSON; emit U+FFFD to keep output valid (the TS side does the
      // same via JSON.stringify well-formedness in Node >= 20).
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

// --- op state ---

static std::unordered_map<int64_t, pretext::PreparedPtr> gPrepared;
static std::unordered_map<int64_t, pretext::PreparedRichInlinePtr> gRich;

static pretext::PrepareOptions optionsFrom(const json& j) {
  pretext::PrepareOptions o;
  if (j.value("whiteSpace", "normal") == std::string("pre-wrap"))
    o.whiteSpace = pretext::WhiteSpaceMode::PreWrap;
  if (j.value("wordBreak", "normal") == std::string("keep-all"))
    o.wordBreak = pretext::WordBreakMode::KeepAll;
  o.letterSpacing = j.value("letterSpacing", 0.0);
  return o;
}

static json cursorJson(const pretext::LayoutCursor& c) {
  return json{{"segmentIndex", c.segmentIndex}, {"graphemeIndex", c.graphemeIndex}};
}

static const char* kindName(pretext::SegmentBreakKind k) {
  using K = pretext::SegmentBreakKind;
  switch (k) {
    case K::Text: return "text";
    case K::Space: return "space";
    case K::PreservedSpace: return "preserved-space";
    case K::Tab: return "tab";
    case K::Glue: return "glue";
    case K::ZeroWidthBreak: return "zero-width-break";
    case K::SoftHyphen: return "soft-hyphen";
    case K::HardBreak: return "hard-break";
  }
  return "?";
}

static json runOp(const json& j) {
  const std::string op = j.at("op");

  if (op == "registerFont") {
    std::ifstream f(j.at("path").get<std::string>(), std::ios::binary);
    std::vector<uint8_t> data((std::istreambuf_iterator<char>(f)),
                              std::istreambuf_iterator<char>());
    pretext::fonts::RegisterFontOptions o;
    o.family = toU16(j.at("family"));
    o.weight = j.value("weight", 400.0);
    std::string style = j.value("style", "normal");
    o.style = style == "italic"   ? pretext::fonts::FontStyle::Italic
              : style == "oblique" ? pretext::fonts::FontStyle::Oblique
                                   : pretext::fonts::FontStyle::Normal;
    o.data = data.data();
    o.size = data.size();
    pretext::fonts::registerFont(o);
    return nullptr;
  }
  if (op == "setGenericFontFamily") {
    pretext::fonts::setGenericFontFamily(toU16(j.at("generic")), toU16(j.at("family")));
    return nullptr;
  }
  if (op == "setEmojiAdvanceEm") {
    pretext::fonts::setEmojiAdvanceEm(j.at("value").get<double>());
    return nullptr;
  }
  if (op == "measureTextWidth") {
    return pretext::fonts::measureTextWidth(toU16(j.at("text")), toU16(j.at("font")));
  }
  if (op == "prepare") {
    auto opts = optionsFrom(j);
    auto text = toU16(j.at("text"));
    auto font = toU16(j.at("font"));
    auto p = j.value("withSegments", true)
                 ? pretext::prepareWithSegments(text, font, opts)
                 : pretext::prepare(text, font, opts);
    gPrepared[j.at("id").get<int64_t>()] = p;
    return nullptr;
  }
  if (op == "preparedDump") {
    const auto& p = *gPrepared.at(j.at("id").get<int64_t>());
    json d;
    d["widths"] = p.widths;
    d["lineEndFitAdvances"] = p.lineEndFitAdvances;
    d["lineEndPaintAdvances"] = p.lineEndPaintAdvances;
    json kinds = json::array();
    for (auto k : p.kinds) kinds.push_back(kindName(k));
    d["kinds"] = std::move(kinds);
    d["simpleLineWalkFastPath"] = p.simpleLineWalkFastPath;
    json bfa = json::array();
    for (const auto& v : p.breakableFitAdvances) {
      if (v) bfa.push_back(*v); else bfa.push_back(nullptr);
    }
    d["breakableFitAdvances"] = std::move(bfa);
    json bpb = json::array();
    for (const auto& v : p.breakablePreferredBreaks) {
      if (v) bpb.push_back(*v); else bpb.push_back(nullptr);
    }
    d["breakablePreferredBreaks"] = std::move(bpb);
    d["letterSpacing"] = p.letterSpacing;
    d["spacingGraphemeCounts"] = p.spacingGraphemeCounts;
    d["discretionaryHyphenWidth"] = p.discretionaryHyphenWidth;
    d["tabStopAdvance"] = p.tabStopAdvance;
    json chunks = json::array();
    for (const auto& c : p.chunks) {
      chunks.push_back({{"startSegmentIndex", c.startSegmentIndex},
                        {"endSegmentIndex", c.endSegmentIndex},
                        {"consumedEndSegmentIndex", c.consumedEndSegmentIndex}});
    }
    d["chunks"] = std::move(chunks);
    if (p.hasSegments) {
      json segs = json::array();
      for (const auto& s : p.segments) segs.push_back(toU8(s));
      d["segments"] = std::move(segs);
    }
    if (p.hasSegLevels) {
      d["segLevels"] = p.segLevels;
    } else {
      d["segLevels"] = nullptr;
    }
    return d;
  }
  if (op == "layout") {
    const auto& p = *gPrepared.at(j.at("id").get<int64_t>());
    auto r = pretext::layout(p, j.at("maxWidth").get<double>(),
                             j.at("lineHeight").get<double>());
    return json{{"lineCount", r.lineCount}, {"height", r.height}};
  }
  if (op == "layoutWithLines") {
    const auto& p = *gPrepared.at(j.at("id").get<int64_t>());
    auto r = pretext::layoutWithLines(p, j.at("maxWidth").get<double>(),
                                      j.at("lineHeight").get<double>());
    json lines = json::array();
    for (const auto& l : r.lines) {
      lines.push_back({{"text", toU8(l.text)},
                       {"width", l.width},
                       {"start", cursorJson(l.start)},
                       {"end", cursorJson(l.end)}});
    }
    return json{{"lineCount", r.lineCount}, {"height", r.height}, {"lines", std::move(lines)}};
  }
  if (op == "measureLineStats") {
    const auto& p = *gPrepared.at(j.at("id").get<int64_t>());
    auto r = pretext::measureLineStats(p, j.at("maxWidth").get<double>());
    return json{{"lineCount", r.lineCount}, {"maxLineWidth", r.maxLineWidth}};
  }
  if (op == "naturalWidth") {
    const auto& p = *gPrepared.at(j.at("id").get<int64_t>());
    return pretext::measureNaturalWidth(p);
  }
  if (op == "prepareRich") {
    std::vector<pretext::RichInlineItem> items;
    for (const auto& it : j.at("items")) {
      pretext::RichInlineItem item;
      item.text = toU16(it.at("text"));
      item.font = toU16(it.at("font"));
      item.letterSpacing = it.value("letterSpacing", 0.0);
      item.breakNever = it.value("break", "normal") == std::string("never");
      item.extraWidth = it.value("extraWidth", 0.0);
      items.push_back(std::move(item));
    }
    gRich[j.at("id").get<int64_t>()] = pretext::prepareRichInline(items);
    return nullptr;
  }
  if (op == "walkRich") {
    const auto& p = *gRich.at(j.at("id").get<int64_t>());
    bool materialize = j.value("materialize", true);
    json lines = json::array();
    int32_t count = pretext::walkRichInlineLineRanges(
        p, j.at("maxWidth").get<double>(),
        [&](const pretext::RichInlineLineRange& range) {
          json frags = json::array();
          if (materialize) {
            auto line = pretext::materializeRichInlineLineRange(p, range);
            for (const auto& f : line.fragments) {
              frags.push_back({{"itemIndex", f.itemIndex},
                               {"text", toU8(f.text)},
                               {"gapBefore", f.gapBefore},
                               {"occupiedWidth", f.occupiedWidth},
                               {"start", cursorJson(f.start)},
                               {"end", cursorJson(f.end)}});
            }
          } else {
            for (const auto& f : range.fragments) {
              frags.push_back({{"itemIndex", f.itemIndex},
                               {"gapBefore", f.gapBefore},
                               {"occupiedWidth", f.occupiedWidth},
                               {"start", cursorJson(f.start)},
                               {"end", cursorJson(f.end)}});
            }
          }
          lines.push_back({{"width", range.width},
                           {"end",
                            json{{"itemIndex", range.end.itemIndex},
                                 {"segmentIndex", range.end.segmentIndex},
                                 {"graphemeIndex", range.end.graphemeIndex}}},
                           {"fragments", std::move(frags)}});
        });
    return json{{"lineCount", count}, {"lines", std::move(lines)}};
  }
  if (op == "richStats") {
    const auto& p = *gRich.at(j.at("id").get<int64_t>());
    auto r = pretext::measureRichInlineStats(p, j.at("maxWidth").get<double>());
    return json{{"lineCount", r.lineCount}, {"maxLineWidth", r.maxLineWidth}};
  }
  if (op == "clearCache") {
    pretext::clearCache();
    gPrepared.clear();
    gRich.clear();
    return nullptr;
  }
  throw std::runtime_error("unknown op: " + op);
}

int main() {
  std::ios::sync_with_stdio(false);
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    json result;
    try {
      result = json{{"ok", runOp(json::parse(line))}};
    } catch (const std::exception& e) {
      result = json{{"error", e.what()}};
    }
    std::cout << result.dump() << "\n";
    std::cout.flush();
  }
  return 0;
}
