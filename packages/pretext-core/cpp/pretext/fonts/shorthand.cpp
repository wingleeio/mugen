// Port of packages/pretext-native/src/engine/shorthand.ts
//
// Canvas `ctx.font` shorthand parser.
//
// pretext drives measurement exclusively through the canvas font shorthand
// (e.g. "italic 500 17px/24px Inter, 'Segoe UI', sans-serif"), so this is the
// only CSS we ever need to understand. We parse the small subset canvas
// actually accepts: optional style/variant/weight keywords, a px size with an
// optional (ignored) line-height, then a comma-separated family list.

#include "shorthand.hpp"

#include <cstdlib>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace pretext::fonts {

namespace {

// --- small string helpers (mirror the JS operations used below) ---------------

// JS `\s` / trim whitespace set (WhiteSpace + LineTerminator).
bool isJsSpace(char16_t c) {
  switch (c) {
    case 0x0009:  // \t
    case 0x000A:  // \n
    case 0x000B:  // \v
    case 0x000C:  // \f
    case 0x000D:  // \r
    case 0x0020:  // space
    case 0x00A0:  // no-break space
    case 0x1680:
    case 0x2000:
    case 0x2001:
    case 0x2002:
    case 0x2003:
    case 0x2004:
    case 0x2005:
    case 0x2006:
    case 0x2007:
    case 0x2008:
    case 0x2009:
    case 0x200A:
    case 0x2028:  // line separator
    case 0x2029:  // paragraph separator
    case 0x202F:
    case 0x205F:
    case 0x3000:
    case 0xFEFF:  // BOM / zero-width no-break space
      return true;
    default:
      return false;
  }
}

bool isAsciiDigit(char16_t c) { return c >= u'0' && c <= u'9'; }

// JS String.prototype.trim over the same whitespace set.
std::u16string jsTrim(const std::u16string& s) {
  size_t start = 0;
  size_t end = s.size();
  while (start < end && isJsSpace(s[start])) start++;
  while (end > start && isJsSpace(s[end - 1])) end--;
  return s.substr(start, end - start);
}

// JS String.prototype.toLowerCase, restricted to ASCII A-Z; non-ASCII code
// units are left unchanged (see PORTING report note). Font shorthand keyword
// tokens are ASCII in practice.
std::u16string asciiLower(const std::u16string& s) {
  std::u16string out = s;
  for (char16_t& c : out) {
    if (c >= u'A' && c <= u'Z') c = char16_t(c + 32);
  }
  return out;
}

// UTF-16 -> UTF-8 for error message interpolation. Unpaired surrogates are
// emitted as their WTF-8-ish 3-byte form (they never appear in valid input).
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

// --- SIZE_RE ------------------------------------------------------------------
//
// SIZE_RE = /(^|\s)(\d+(?:\.\d+)?)px(\s*\/\s*(?:\d+(?:\.\d+)?(?:px|em|%)?|normal))?(?=\s|$)/
//
// The size token anchors the whole parse: everything before it is keywords,
// everything after it is the family list. Line-height ('/24px', '/1.5',
// '/normal') is layout-only — glyph advances don't depend on it — so we match
// and discard it.
//
// Hand-rolled leftmost match that mirrors JS RegExp.exec: scan start positions
// ascending, and at each position try the group1 `(^|\s)` alternation in order.
// (See report for why internal digit/unit backtracking can never rescue the
// trailing `(?=\s|$)` lookahead, so only the greedy group3 and the empty group3
// are viable candidates.)

// End position of the greedy group3 optional, or `r3` (unmatched) — mirrors
// `(\s*\/\s*(?:\d+(?:\.\d+)?(?:px|em|%)?|normal))?` starting at r3.
size_t matchGroup3(const std::u16string& s, size_t r3, bool& matched) {
  size_t n = s.size();
  size_t pos = r3;
  // \s*
  while (pos < n && isJsSpace(s[pos])) pos++;
  // /
  if (pos >= n || s[pos] != u'/') {
    matched = false;
    return r3;
  }
  pos++;
  // \s*
  while (pos < n && isJsSpace(s[pos])) pos++;
  // (?: \d+(?:\.\d+)?(?:px|em|%)? | normal )
  if (pos < n && isAsciiDigit(s[pos])) {
    while (pos < n && isAsciiDigit(s[pos])) pos++;  // \d+
    if (pos + 1 < n && s[pos] == u'.' && isAsciiDigit(s[pos + 1])) {
      pos++;                                        // .
      while (pos < n && isAsciiDigit(s[pos])) pos++;  // \d+
    }
    // (?:px|em|%)?
    if (pos + 1 < n && s[pos] == u'p' && s[pos + 1] == u'x') {
      pos += 2;
    } else if (pos + 1 < n && s[pos] == u'e' && s[pos + 1] == u'm') {
      pos += 2;
    } else if (pos < n && s[pos] == u'%') {
      pos += 1;
    }
    matched = true;
    return pos;
  }
  // "normal"
  static const char16_t NORMAL[] = {u'n', u'o', u'r', u'm', u'a', u'l'};
  if (pos + 6 <= n && s[pos] == NORMAL[0] && s[pos + 1] == NORMAL[1] &&
      s[pos + 2] == NORMAL[2] && s[pos + 3] == NORMAL[3] &&
      s[pos + 4] == NORMAL[4] && s[pos + 5] == NORMAL[5]) {
    matched = true;
    return pos + 6;
  }
  matched = false;
  return r3;
}

// Try to match starting group1 at index p with group1 consuming to q. On
// success sets numStart/numEnd (m[2]) and matchEnd (end of m[0]).
bool tryFrom(const std::u16string& s, size_t q, size_t& numStart, size_t& numEnd,
             size_t& matchEnd) {
  size_t n = s.size();
  // (\d+(?:\.\d+)?)
  if (q >= n || !isAsciiDigit(s[q])) return false;
  size_t ns = q;
  size_t pos = q;
  while (pos < n && isAsciiDigit(s[pos])) pos++;  // \d+
  if (pos + 1 < n && s[pos] == u'.' && isAsciiDigit(s[pos + 1])) {
    pos++;                                          // .
    while (pos < n && isAsciiDigit(s[pos])) pos++;  // \d+
  }
  size_t ne = pos;
  // px
  if (pos + 1 < n && s[pos] == u'p' && s[pos + 1] == u'x') {
    pos += 2;
  } else {
    return false;
  }
  size_t r3 = pos;
  // optional group3, greedy then empty; keep the first candidate whose
  // (?=\s|$) lookahead succeeds.
  bool g3matched = false;
  size_t g3end = matchGroup3(s, r3, g3matched);
  auto lookahead = [&](size_t at) { return at >= n || isJsSpace(s[at]); };
  if (g3matched && lookahead(g3end)) {
    numStart = ns;
    numEnd = ne;
    matchEnd = g3end;
    return true;
  }
  if (lookahead(r3)) {
    numStart = ns;
    numEnd = ne;
    matchEnd = r3;
    return true;
  }
  return false;
}

// Mirrors SIZE_RE.exec(font). Returns true and fills index/matchEnd/num range.
bool execSizeRe(const std::u16string& s, size_t& index, size_t& matchEnd,
                size_t& numStart, size_t& numEnd) {
  size_t n = s.size();
  for (size_t p = 0; p < n || p == 0; p++) {
    // group1 alternation `(^|\s)` in order: `^` (only at p==0) then `\s`.
    if (p == 0) {
      if (tryFrom(s, 0, numStart, numEnd, matchEnd)) {
        index = 0;
        return true;
      }
    }
    if (p < n && isJsSpace(s[p])) {
      if (tryFrom(s, p + 1, numStart, numEnd, matchEnd)) {
        index = p;
        return true;
      }
    }
    if (n == 0) break;
  }
  return false;
}

// --- weight / family helpers --------------------------------------------------

// token is already lowercased (as in the TS caller).
// Returns weight, or -1 to signal "null".
double parseWeightToken(const std::u16string& token) {
  if (token == u"normal") return 400;
  if (token == u"bold") return 700;
  if (token == u"lighter") return 400;
  if (token == u"bolder") return 700;
  // /^\d{1,4}$/
  if (token.size() >= 1 && token.size() <= 4) {
    bool allDigits = true;
    for (char16_t c : token) {
      if (!isAsciiDigit(c)) {
        allDigits = false;
        break;
      }
    }
    if (allDigits) {
      // parseInt(token, 10)
      int n = 0;
      for (char16_t c : token) n = n * 10 + int(c - u'0');
      if (n >= 1 && n <= 1000) return double(n);
    }
  }
  return -1;
}

std::vector<std::u16string> parseFamilyList(const std::u16string& raw,
                                            const std::u16string& font) {
  // Hand-rolled scan instead of a naive split(',') so quoted family names
  // containing commas ("Foo, The Font") survive intact.
  std::vector<std::u16string> families;
  std::u16string current;
  char16_t quote = 0;  // 0 == not in quotes
  for (size_t i = 0; i < raw.size(); i++) {
    char16_t ch = raw[i];
    if (quote != 0) {
      if (ch == quote)
        quote = 0;
      else
        current += ch;
    } else if (ch == u'"' || ch == u'\'') {
      quote = ch;
    } else if (ch == u',') {
      std::u16string name = jsTrim(current);
      if (name.size() > 0) families.push_back(name);
      current.clear();
    } else {
      current += ch;
    }
  }
  std::u16string last = jsTrim(current);
  if (last.size() > 0) families.push_back(last);
  if (families.empty()) {
    throw std::runtime_error(
        "pretext-native: font shorthand has no font family: \"" + toUtf8(font) +
        "\".");
  }
  return families;
}

std::unordered_map<std::u16string, ParsedShorthand>& parseCache() {
  static std::unordered_map<std::u16string, ParsedShorthand> cache;
  return cache;
}

}  // namespace

const ParsedShorthand& parseFontShorthand(const std::u16string& font) {
  auto& cache = parseCache();
  auto cached = cache.find(font);
  if (cached != cache.end()) return cached->second;

  size_t index = 0, matchEnd = 0, numStart = 0, numEnd = 0;
  if (!execSizeRe(font, index, matchEnd, numStart, numEnd)) {
    throw std::runtime_error(
        "pretext-native: could not find a px font size in font shorthand \"" +
        toUtf8(font) +
        "\". Expected canvas shorthand like \"16px Inter\" or \"italic 600 "
        "15px Inter, sans-serif\".");
  }

  // parseFloat(m[2])
  std::u16string numU16 = font.substr(numStart, numEnd - numStart);
  std::string numAscii(numU16.begin(), numU16.end());
  double sizePx = std::strtod(numAscii.c_str(), nullptr);

  std::u16string before = jsTrim(font.substr(0, index));
  std::u16string after = jsTrim(font.substr(matchEnd));

  FontStyle style = FontStyle::Normal;
  double weight = 400;
  if (before.size() > 0) {
    // for (const token of before.split(/\s+/))
    size_t i = 0;
    while (i < before.size()) {
      size_t start = i;
      while (i < before.size() && !isJsSpace(before[i])) i++;
      std::u16string token = before.substr(start, i - start);
      while (i < before.size() && isJsSpace(before[i])) i++;  // skip \s+

      std::u16string lower = asciiLower(token);
      if (lower == u"normal") continue;  // ambiguous reset — all default anyway
      if (lower == u"italic" || lower == u"oblique") {
        style = (lower == u"italic") ? FontStyle::Italic : FontStyle::Oblique;
        continue;
      }
      if (lower == u"small-caps") continue;  // no effect on advances we model
      double w = parseWeightToken(lower);
      if (w >= 0) {
        weight = w;
        continue;
      }
      throw std::runtime_error("pretext-native: unrecognized token \"" +
                               toUtf8(token) + "\" in font shorthand \"" +
                               toUtf8(font) + "\".");
    }
  }

  ParsedShorthand parsed;
  parsed.style = style;
  parsed.weight = weight;
  parsed.sizePx = sizePx;
  parsed.families = parseFamilyList(after, font);

  auto res = cache.emplace(font, std::move(parsed));
  return res.first->second;
}

void clearShorthandCache() { parseCache().clear(); }

}  // namespace pretext::fonts
