// Port of @chenglou/pretext@0.0.8 src/layout.ts — the public engine API.
//
// Two-phase measurement: prepare() segments+measures text once, layout() walks
// the cached widths with pure arithmetic on every resize. See the TS header
// comment for the full design rationale. Native-only deviations (PORTING.md
// rule 4): the shared Intl.Segmenter is the stateless pretext::seg port,
// emojiCorrection ≡ 0 so getCorrectedSegmentWidth is a passthrough, and the
// per-prepared line-text cache lives on the Prepared handle instead of a
// WeakMap. `getInternalPrepared` casts are gone — Prepared is passed directly.

#include "layout.hpp"

#include <limits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "analysis.hpp"
#include "bidi.hpp"
#include "line_break.hpp"
#include "line_text.hpp"
#include "measurement.hpp"
#include "segmenter/grapheme.hpp"

namespace pretext {

namespace {

// getSharedGraphemeSegmenter() usages map to the stateless pretext::seg port;
// there is no module-level segmenter handle on native.

// --- createEmptyPrepared (both variants) ---

Prepared createEmptyPrepared(bool includeSegments) {
  Prepared prepared;
  // All parallel arrays default to empty vectors.
  prepared.simpleLineWalkFastPath = true;
  // segLevels: null → hasSegLevels stays false.
  prepared.letterSpacing = 0;
  prepared.discretionaryHyphenWidth = 0;
  prepared.tabStopAdvance = 0;
  // segments: [] when includeSegments (the array stays empty either way).
  prepared.hasSegments = includeSegments;
  return prepared;
}

struct MeasuredTextUnit {
  std::u16string text;
  int32_t start = 0;
};

std::vector<MeasuredTextUnit> buildBaseCjkUnits(const std::u16string& segText,
                                                const EngineProfile& engineProfile) {
  std::vector<MeasuredTextUnit> units;
  std::vector<std::u16string> unitParts;
  int32_t unitStart = 0;
  bool unitContainsCJK = false;
  bool unitEndsWithClosingQuote = false;
  bool unitIsSingleKinsokuEnd = false;

  auto pushUnit = [&]() {
    if (unitParts.empty()) return;
    std::u16string text;
    if (unitParts.size() == 1) {
      text = unitParts[0];
    } else {
      for (const std::u16string& part : unitParts) text += part;
    }
    units.push_back({std::move(text), unitStart});
    unitParts.clear();
    unitContainsCJK = false;
    unitEndsWithClosingQuote = false;
    unitIsSingleKinsokuEnd = false;
  };

  auto startUnit = [&](const std::u16string& grapheme, int32_t start,
                       bool graphemeContainsCJK) {
    unitParts.clear();
    unitParts.push_back(grapheme);
    unitStart = start;
    unitContainsCJK = graphemeContainsCJK;
    unitEndsWithClosingQuote = endsWithClosingQuote(grapheme);
    unitIsSingleKinsokuEnd = isKinsokuEnd(grapheme);
  };

  auto appendToUnit = [&](const std::u16string& grapheme, bool graphemeContainsCJK) {
    unitParts.push_back(grapheme);
    unitContainsCJK = unitContainsCJK || graphemeContainsCJK;
    const bool graphemeEndsWithClosingQuote = endsWithClosingQuote(grapheme);
    if (grapheme.size() == 1 && isLeftStickyPunctuation(grapheme)) {
      unitEndsWithClosingQuote = unitEndsWithClosingQuote || graphemeEndsWithClosingQuote;
    } else {
      unitEndsWithClosingQuote = graphemeEndsWithClosingQuote;
    }
    unitIsSingleKinsokuEnd = false;
  };

  for (const seg::GraphemeSegment& gs : seg::iterateGraphemes(segText)) {
    const std::u16string& grapheme = gs.segment;
    const bool graphemeContainsCJK = isCJK(grapheme);

    if (unitParts.empty()) {
      startUnit(grapheme, gs.index, graphemeContainsCJK);
      continue;
    }

    if (unitIsSingleKinsokuEnd ||
        isKinsokuStart(grapheme) ||
        isLeftStickyPunctuation(grapheme) ||
        (engineProfile.carryCJKAfterClosingQuote &&
         graphemeContainsCJK &&
         unitEndsWithClosingQuote)) {
      appendToUnit(grapheme, graphemeContainsCJK);
      continue;
    }

    if (!unitContainsCJK && !graphemeContainsCJK) {
      appendToUnit(grapheme, graphemeContainsCJK);
      continue;
    }

    pushUnit();
    startUnit(grapheme, gs.index, graphemeContainsCJK);
  }

  pushUnit();
  return units;
}

std::vector<MeasuredTextUnit> mergeKeepAllTextUnits(const std::u16string& segText,
                                                    const std::vector<MeasuredTextUnit>& units,
                                                    bool breakAfterPunctuation) {
  if (units.size() <= 1) return units;

  std::vector<MeasuredTextUnit> merged;
  int32_t groupStart = -1;
  bool groupContainsCJK = false;

  auto pushMergedUnit = [&](int32_t start, int32_t end) {
    const int32_t sourceStart = units[start].start;
    const int32_t sourceEnd = end < static_cast<int32_t>(units.size())
                                  ? units[end].start
                                  : static_cast<int32_t>(segText.size());

    merged.push_back({
        segText.substr(sourceStart, sourceEnd - sourceStart),
        sourceStart,
    });
  };

  auto flushGroup = [&](int32_t end) {
    if (groupStart < 0) return;

    if (groupContainsCJK) {
      if (groupStart + 1 == end) {
        merged.push_back(units[groupStart]);
      } else {
        pushMergedUnit(groupStart, end);
      }
    } else {
      for (int32_t i = groupStart; i < end; i++) merged.push_back(units[i]);
    }

    groupStart = -1;
    groupContainsCJK = false;
  };

  for (int32_t i = 0; i < static_cast<int32_t>(units.size()); i++) {
    const MeasuredTextUnit& unit = units[i];
    if (groupStart >= 0 &&
        !canContinueKeepAllTextRun(units[i - 1].text, breakAfterPunctuation)) {
      flushGroup(i);
    }
    if (groupStart < 0) groupStart = i;
    groupContainsCJK = groupContainsCJK || isCJK(unit.text);
  }

  flushGroup(static_cast<int32_t>(units.size()));
  return merged;
}

int32_t countRenderedSpacingGraphemes(const std::u16string& text, SegmentBreakKind kind) {
  if (kind == SegmentBreakKind::ZeroWidthBreak ||
      kind == SegmentBreakKind::SoftHyphen ||
      kind == SegmentBreakKind::HardBreak) {
    return 0;
  }

  if (kind == SegmentBreakKind::Tab) return 1;

  return seg::countGraphemes(text);
}

bool isPreferredBreakGrapheme(const std::u16string& grapheme) {
  return grapheme == u"-" ||
         grapheme == u"֊" ||
         grapheme == u"‐" ||
         grapheme == u"‒" ||
         grapheme == u"–" ||
         grapheme == u"—";
}

// TS: /[-֊‐‒–—]/u.test(text) → explicit char checks.
std::optional<std::vector<double>> getBreakablePreferredBreaks(const std::u16string& text) {
  bool hasPreferredBreakChar = false;
  for (char16_t c : text) {
    if (c == u'-' || c == 0x058A || c == 0x2010 || c == 0x2012 || c == 0x2013 ||
        c == 0x2014) {
      hasPreferredBreakChar = true;
      break;
    }
  }
  if (!hasPreferredBreakChar) return std::nullopt;

  std::vector<double> breaks;
  int32_t graphemeIndex = 0;
  for (const seg::GraphemeSegment& gs : seg::iterateGraphemes(text)) {
    graphemeIndex++;
    if (isPreferredBreakGrapheme(gs.segment)) breaks.push_back(graphemeIndex);
  }

  if (breaks.empty()) return std::nullopt;
  return std::optional<std::vector<double>>(std::move(breaks));
}

double addInternalLetterSpacing(double width, int32_t graphemeCount, double letterSpacing) {
  return graphemeCount > 1 ? width + (graphemeCount - 1) * letterSpacing : width;
}

std::vector<PreparedLineChunk> mapAnalysisChunksToPreparedChunks(
    const std::vector<AnalysisChunk>& chunks,
    const std::vector<int32_t>& preparedStartByAnalysisIndex,
    int32_t preparedEndSegmentIndex) {
  std::vector<PreparedLineChunk> preparedChunks;
  const int32_t analysisLen = static_cast<int32_t>(preparedStartByAnalysisIndex.size());
  for (size_t i = 0; i < chunks.size(); i++) {
    const AnalysisChunk& chunk = chunks[i];
    const int32_t startSegmentIndex =
        chunk.startSegmentIndex < analysisLen
            ? preparedStartByAnalysisIndex[chunk.startSegmentIndex]
            : preparedEndSegmentIndex;
    const int32_t endSegmentIndex =
        chunk.endSegmentIndex < analysisLen
            ? preparedStartByAnalysisIndex[chunk.endSegmentIndex]
            : preparedEndSegmentIndex;
    const int32_t consumedEndSegmentIndex =
        chunk.consumedEndSegmentIndex < analysisLen
            ? preparedStartByAnalysisIndex[chunk.consumedEndSegmentIndex]
            : preparedEndSegmentIndex;

    preparedChunks.push_back({
        startSegmentIndex,
        endSegmentIndex,
        consumedEndSegmentIndex,
    });
  }
  return preparedChunks;
}

Prepared measureAnalysis(const TextAnalysis& analysis, const std::u16string& font,
                         bool includeSegments, WordBreakMode wordBreak,
                         double letterSpacing) {
  const EngineProfile& engineProfile = getEngineProfile();
  // TS: const { cache, emojiCorrection } = getFontMeasurementState(...).
  // emojiCorrection ≡ 0 on native; getCorrectedSegmentWidth is a passthrough.
  FontMeasurementState fontState = getFontMeasurementState(font);
  SegmentMetricCache& cache = *fontState.cache;
  const double discretionaryHyphenWidth =
      getCorrectedSegmentWidth(getSegmentMetrics(u"-", cache, font)) +
      (letterSpacing == 0 ? 0 : letterSpacing * 2);
  const double spaceWidth = getCorrectedSegmentWidth(getSegmentMetrics(u" ", cache, font));
  const double tabStopAdvance = spaceWidth * 8;
  const bool hasLetterSpacing = letterSpacing != 0;

  if (analysis.len == 0) return createEmptyPrepared(includeSegments);

  std::vector<double> widths;
  std::vector<double> lineEndFitAdvances;
  std::vector<double> lineEndPaintAdvances;
  std::vector<SegmentBreakKind> kinds;
  bool simpleLineWalkFastPath = analysis.chunks.size() <= 1 && !hasLetterSpacing;
  std::vector<int32_t> segStarts;  // null == !includeSegments (hasSegStarts below)
  std::vector<std::optional<std::vector<double>>> breakableFitAdvances;
  std::vector<std::optional<std::vector<double>>> breakablePreferredBreaks;
  std::vector<int32_t> spacingGraphemeCounts;
  std::vector<std::u16string> segments;  // null == !includeSegments
  std::vector<int32_t> preparedStartByAnalysisIndex(analysis.len);

  auto pushMeasuredSegment = [&](const std::u16string& text, double width,
                                 double lineEndFitAdvance, double lineEndPaintAdvance,
                                 SegmentBreakKind kind, int32_t start,
                                 std::optional<std::vector<double>> breakableFitAdvance,
                                 std::optional<std::vector<double>> breakablePreferredBreak,
                                 int32_t spacingGraphemeCount) {
    if (kind != SegmentBreakKind::Text && kind != SegmentBreakKind::Space &&
        kind != SegmentBreakKind::ZeroWidthBreak) {
      simpleLineWalkFastPath = false;
    }
    widths.push_back(width);
    lineEndFitAdvances.push_back(lineEndFitAdvance);
    lineEndPaintAdvances.push_back(lineEndPaintAdvance);
    kinds.push_back(kind);
    if (includeSegments) segStarts.push_back(start);
    breakableFitAdvances.push_back(std::move(breakableFitAdvance));
    breakablePreferredBreaks.push_back(std::move(breakablePreferredBreak));
    if (hasLetterSpacing) spacingGraphemeCounts.push_back(spacingGraphemeCount);
    if (includeSegments) segments.push_back(text);
  };

  auto pushMeasuredTextSegment = [&](const std::u16string& text, SegmentBreakKind kind,
                                     int32_t start, bool wordLike,
                                     bool allowOverflowBreaks) {
    SegmentMetrics& textMetrics = getSegmentMetrics(text, cache, font);
    const int32_t spacingGraphemeCount =
        hasLetterSpacing ? countRenderedSpacingGraphemes(text, kind) : 0;
    const double width = addInternalLetterSpacing(
        getCorrectedSegmentWidth(textMetrics), spacingGraphemeCount, letterSpacing);
    const double baseLineEndFitAdvance =
        kind == SegmentBreakKind::Space || kind == SegmentBreakKind::PreservedSpace ||
                kind == SegmentBreakKind::ZeroWidthBreak
            ? 0
            : width;
    const double lineEndFitAdvance =
        baseLineEndFitAdvance == 0
            ? 0
            : baseLineEndFitAdvance + (spacingGraphemeCount > 0 ? letterSpacing : 0);
    const double lineEndPaintAdvance =
        kind == SegmentBreakKind::Space || kind == SegmentBreakKind::ZeroWidthBreak
            ? 0
            : width;

    if (allowOverflowBreaks && wordLike && text.size() > 1) {
      BreakableFitMode fitMode = BreakableFitMode::SumGraphemes;
      if (letterSpacing != 0) {
        fitMode = BreakableFitMode::SegmentPrefixes;
      } else if (isNumericRunSegment(text)) {
        fitMode = BreakableFitMode::PairContext;
      } else if (engineProfile.preferPrefixWidthsForBreakableRuns) {
        fitMode = BreakableFitMode::SegmentPrefixes;
      }
      const std::optional<std::vector<double>>& fitAdvances =
          getSegmentBreakableFitAdvances(text, textMetrics, cache, font, fitMode);
      std::optional<std::vector<double>> preferredBreaks =
          (!fitAdvances.has_value() || wordBreak == WordBreakMode::KeepAll)
              ? std::nullopt
              : getBreakablePreferredBreaks(text);
      pushMeasuredSegment(text, width, lineEndFitAdvance, lineEndPaintAdvance, kind,
                          start, fitAdvances, std::move(preferredBreaks),
                          spacingGraphemeCount);
      return;
    }

    pushMeasuredSegment(text, width, lineEndFitAdvance, lineEndPaintAdvance, kind,
                        start, std::nullopt, std::nullopt, spacingGraphemeCount);
  };

  for (int32_t mi = 0; mi < analysis.len; mi++) {
    preparedStartByAnalysisIndex[mi] = static_cast<int32_t>(widths.size());
    const std::u16string& segText = analysis.texts[mi];
    const bool segWordLike = analysis.isWordLike[mi];
    const SegmentBreakKind segKind = analysis.kinds[mi];
    const int32_t segStart = analysis.starts[mi];

    if (segKind == SegmentBreakKind::SoftHyphen) {
      pushMeasuredSegment(segText, 0, discretionaryHyphenWidth, discretionaryHyphenWidth,
                          segKind, segStart, std::nullopt, std::nullopt, 0);
      continue;
    }

    if (segKind == SegmentBreakKind::HardBreak) {
      pushMeasuredSegment(segText, 0, 0, 0, segKind, segStart, std::nullopt,
                          std::nullopt, 0);
      continue;
    }

    if (segKind == SegmentBreakKind::Tab) {
      pushMeasuredSegment(
          segText, 0, 0, 0, segKind, segStart, std::nullopt, std::nullopt,
          hasLetterSpacing ? countRenderedSpacingGraphemes(segText, segKind) : 0);
      continue;
    }

    SegmentMetrics& segMetrics = getSegmentMetrics(segText, cache, font);

    if (segKind == SegmentBreakKind::Text && segMetrics.containsCJK) {
      std::vector<MeasuredTextUnit> baseUnits = buildBaseCjkUnits(segText, engineProfile);
      std::vector<MeasuredTextUnit> measuredUnits =
          wordBreak == WordBreakMode::KeepAll
              ? mergeKeepAllTextUnits(segText, baseUnits,
                                      engineProfile.breakKeepAllAfterPunctuation)
              : baseUnits;

      for (size_t i = 0; i < measuredUnits.size(); i++) {
        const MeasuredTextUnit& unit = measuredUnits[i];
        pushMeasuredTextSegment(unit.text, SegmentBreakKind::Text, segStart + unit.start,
                                segWordLike,
                                wordBreak == WordBreakMode::KeepAll || !isCJK(unit.text));
      }
      continue;
    }

    pushMeasuredTextSegment(segText, segKind, segStart, segWordLike, true);
  }

  std::vector<PreparedLineChunk> chunks = mapAnalysisChunksToPreparedChunks(
      analysis.chunks, preparedStartByAnalysisIndex, static_cast<int32_t>(widths.size()));
  // segStarts === null ? null : computeSegmentLevels(...) — only on the rich path.
  SegmentLevels segLevels;
  if (includeSegments) {
    segLevels = computeSegmentLevels(analysis.normalized, segStarts);
  }

  Prepared prepared;
  prepared.widths = std::move(widths);
  prepared.lineEndFitAdvances = std::move(lineEndFitAdvances);
  prepared.lineEndPaintAdvances = std::move(lineEndPaintAdvances);
  prepared.kinds = std::move(kinds);
  prepared.simpleLineWalkFastPath = simpleLineWalkFastPath;
  if (segLevels.hasLevels) {
    prepared.segLevels = std::move(segLevels.levels);
    prepared.hasSegLevels = true;
  }
  prepared.breakableFitAdvances = std::move(breakableFitAdvances);
  prepared.breakablePreferredBreaks = std::move(breakablePreferredBreaks);
  prepared.letterSpacing = letterSpacing;
  prepared.spacingGraphemeCounts = std::move(spacingGraphemeCounts);
  prepared.discretionaryHyphenWidth = discretionaryHyphenWidth;
  prepared.tabStopAdvance = tabStopAdvance;
  prepared.chunks = std::move(chunks);
  prepared.hasSegments = includeSegments;
  if (includeSegments) prepared.segments = std::move(segments);
  return prepared;
}

Prepared prepareInternal(const std::u16string& text, const std::u16string& font,
                         bool includeSegments, const PrepareOptions& options) {
  const WordBreakMode wordBreak = options.wordBreak;
  const double letterSpacing = options.letterSpacing;
  // The AnalysisProfile subset comes from kNativeEngineProfile fields.
  const EngineProfile& engineProfile = getEngineProfile();
  const AnalysisProfile analysisProfile{engineProfile.carryCJKAfterClosingQuote,
                                        engineProfile.breakKeepAllAfterPunctuation};
  const TextAnalysis analysis =
      analyzeText(text, analysisProfile, options.whiteSpace, wordBreak);
  return measureAnalysis(analysis, font, includeSegments, wordBreak, letterSpacing);
}

// --- LayoutLine / LayoutLineRange builders (cache lives on the handle) ---

LayoutLine createLayoutLine(const Prepared& prepared, double width,
                            int32_t startSegmentIndex, int32_t startGraphemeIndex,
                            int32_t endSegmentIndex, int32_t endGraphemeIndex) {
  LayoutLine line;
  line.text = buildLineTextFromRange(prepared, startSegmentIndex, startGraphemeIndex,
                                     endSegmentIndex, endGraphemeIndex);
  line.width = width;
  line.start = {startSegmentIndex, startGraphemeIndex};
  line.end = {endSegmentIndex, endGraphemeIndex};
  return line;
}

LayoutLineRange createLayoutLineRange(double width, int32_t startSegmentIndex,
                                      int32_t startGraphemeIndex, int32_t endSegmentIndex,
                                      int32_t endGraphemeIndex) {
  LayoutLineRange line;
  line.width = width;
  line.start = {startSegmentIndex, startGraphemeIndex};
  line.end = {endSegmentIndex, endGraphemeIndex};
  return line;
}

}  // namespace

// --- Public API ---

PreparedPtr prepare(const std::u16string& text, const std::u16string& font,
                    const PrepareOptions& options) {
  return std::make_shared<Prepared>(prepareInternal(text, font, false, options));
}

PreparedPtr prepareWithSegments(const std::u16string& text, const std::u16string& font,
                                const PrepareOptions& options) {
  return std::make_shared<Prepared>(prepareInternal(text, font, true, options));
}

LayoutResult layout(const Prepared& prepared, double maxWidth, double lineHeight) {
  // Keep the resize hot path specialized; layoutWithLines() shares the break
  // semantics but tracks line ranges too.
  const int32_t lineCount = countPreparedLines(prepared, maxWidth);
  return {lineCount, lineCount * lineHeight};
}

LayoutLine materializeLineRange(const Prepared& prepared, const LayoutLineRange& line) {
  return createLayoutLine(prepared, line.width, line.start.segmentIndex,
                          line.start.graphemeIndex, line.end.segmentIndex,
                          line.end.graphemeIndex);
}

int32_t walkLineRanges(const Prepared& prepared, double maxWidth,
                       const std::function<void(const LayoutLineRange&)>& onLine) {
  if (prepared.widths.empty()) return 0;

  const InternalLineVisitor visitor =
      [&](double width, int32_t startSegmentIndex, int32_t startGraphemeIndex,
          int32_t endSegmentIndex, int32_t endGraphemeIndex) {
        onLine(createLayoutLineRange(width, startSegmentIndex, startGraphemeIndex,
                                     endSegmentIndex, endGraphemeIndex));
      };
  return walkPreparedLinesRaw(prepared, maxWidth, &visitor);
}

LineStats measureLineStats(const Prepared& prepared, double maxWidth) {
  return measurePreparedLineGeometry(prepared, maxWidth);
}

double measureNaturalWidth(const Prepared& prepared) {
  double maxWidth = 0;
  const InternalLineVisitor visitor = [&](double width, int32_t, int32_t, int32_t,
                                          int32_t) {
    if (width > maxWidth) maxWidth = width;
  };
  walkPreparedLinesRaw(prepared, std::numeric_limits<double>::infinity(), &visitor);
  return maxWidth;
}

std::optional<LayoutLine> layoutNextLine(const Prepared& prepared,
                                         const LayoutCursor& start, double maxWidth) {
  LayoutCursor end{start.segmentIndex, start.graphemeIndex};
  const int32_t chunkIndex = normalizePreparedLineStart(prepared, end);
  if (chunkIndex < 0) return std::nullopt;

  const int32_t lineStartSegmentIndex = end.segmentIndex;
  const int32_t lineStartGraphemeIndex = end.graphemeIndex;
  const std::optional<double> width =
      stepPreparedLineGeometryFromChunk(prepared, end, chunkIndex, maxWidth);
  if (!width.has_value()) return std::nullopt;

  return createLayoutLine(prepared, *width, lineStartSegmentIndex, lineStartGraphemeIndex,
                          end.segmentIndex, end.graphemeIndex);
}

std::optional<LayoutLineRange> layoutNextLineRange(const Prepared& prepared,
                                                   const LayoutCursor& start,
                                                   double maxWidth) {
  LayoutCursor end{start.segmentIndex, start.graphemeIndex};
  const int32_t chunkIndex = normalizePreparedLineStart(prepared, end);
  if (chunkIndex < 0) return std::nullopt;

  const int32_t lineStartSegmentIndex = end.segmentIndex;
  const int32_t lineStartGraphemeIndex = end.graphemeIndex;
  const std::optional<double> width =
      stepPreparedLineGeometryFromChunk(prepared, end, chunkIndex, maxWidth);
  if (!width.has_value()) return std::nullopt;

  return createLayoutLineRange(*width, lineStartSegmentIndex, lineStartGraphemeIndex,
                               end.segmentIndex, end.graphemeIndex);
}

LayoutLinesResult layoutWithLines(const Prepared& prepared, double maxWidth,
                                  double lineHeight) {
  std::vector<LayoutLine> lines;
  if (prepared.widths.empty()) return {0, 0, std::move(lines)};

  const InternalLineVisitor visitor =
      [&](double width, int32_t startSegmentIndex, int32_t startGraphemeIndex,
          int32_t endSegmentIndex, int32_t endGraphemeIndex) {
        lines.push_back(createLayoutLine(prepared, width, startSegmentIndex,
                                         startGraphemeIndex, endSegmentIndex,
                                         endGraphemeIndex));
      };
  const int32_t lineCount = walkPreparedLinesRaw(prepared, maxWidth, &visitor);

  return {lineCount, lineCount * lineHeight, std::move(lines)};
}

void clearCache() {
  clearAnalysisCaches();
  // sharedGraphemeSegmenter = null — the pretext::seg segmenter is stateless.
  clearLineTextCaches();
  clearMeasurementCaches();
}

}  // namespace pretext
