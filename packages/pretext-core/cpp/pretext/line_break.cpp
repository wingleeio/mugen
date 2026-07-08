// Port of @chenglou/pretext@0.0.8 src/line-break.ts
// The greedy line walker (simple fast path + chunked full path with pre-wrap
// tabs, soft hyphens, letter-spacing, breakable segments).
//
// Structure mirrors the TS module 1:1 (PORTING.md rule 3). Arithmetic is
// ported in the exact same order; every JS number is a double.

#include "line_break.hpp"

#include <cmath>
#include <optional>
#include <vector>

#include "measurement.hpp"

namespace pretext {

namespace {

// PreparedLineBreakData is a structural subset of Prepared (see line_break.hpp).
// LineBreakCursor == LayoutCursor.

bool consumesAtLineStart(SegmentBreakKind kind) {
  return kind == SegmentBreakKind::Space ||
         kind == SegmentBreakKind::ZeroWidthBreak ||
         kind == SegmentBreakKind::SoftHyphen;
}

bool breaksAfter(SegmentBreakKind kind) {
  return (
      kind == SegmentBreakKind::Space ||
      kind == SegmentBreakKind::PreservedSpace ||
      kind == SegmentBreakKind::Tab ||
      kind == SegmentBreakKind::ZeroWidthBreak ||
      kind == SegmentBreakKind::SoftHyphen);
}

int32_t normalizeLineStartSegmentIndex(
    const Prepared& prepared,
    int32_t segmentIndex,
    int32_t endSegmentIndex) {
  while (segmentIndex < endSegmentIndex) {
    const SegmentBreakKind kind = prepared.kinds[segmentIndex];
    if (!consumesAtLineStart(kind)) break;
    segmentIndex++;
  }
  return segmentIndex;
}

// TS default parameter: endSegmentIndex = prepared.widths.length
int32_t normalizeLineStartSegmentIndex(const Prepared& prepared, int32_t segmentIndex) {
  return normalizeLineStartSegmentIndex(
      prepared, segmentIndex, static_cast<int32_t>(prepared.widths.size()));
}

double getTabAdvance(double lineWidth, double tabStopAdvance) {
  if (tabStopAdvance <= 0) return 0;

  const double remainder = std::fmod(lineWidth, tabStopAdvance);
  if (std::abs(remainder) <= 1e-6) return tabStopAdvance;
  return tabStopAdvance - remainder;
}

double getLeadingLetterSpacing(
    const Prepared& prepared,
    bool hasContent,
    int32_t segmentIndex) {
  return (
      prepared.letterSpacing != 0 &&
      hasContent &&
      prepared.spacingGraphemeCounts[segmentIndex] > 0)
      ? prepared.letterSpacing
      : 0;
}

double getLineEndContribution(double leadingSpacing, double segmentContribution) {
  return segmentContribution == 0 ? 0 : leadingSpacing + segmentContribution;
}

double getTabTrailingLetterSpacing(
    const Prepared& prepared,
    int32_t segmentIndex) {
  return (
      prepared.letterSpacing != 0 &&
      prepared.spacingGraphemeCounts[segmentIndex] > 0)
      ? prepared.letterSpacing
      : 0;
}

double getWholeSegmentFitContribution(
    const Prepared& prepared,
    SegmentBreakKind kind,
    int32_t segmentIndex,
    double leadingSpacing,
    double segmentWidth) {
  const double segmentContribution = kind == SegmentBreakKind::Tab
      ? segmentWidth + getTabTrailingLetterSpacing(prepared, segmentIndex)
      : prepared.lineEndFitAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

double getBreakOpportunityFitContribution(
    const Prepared& prepared,
    SegmentBreakKind kind,
    int32_t segmentIndex,
    double leadingSpacing) {
  const double segmentContribution =
      kind == SegmentBreakKind::Tab ? 0 : prepared.lineEndFitAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

double getLineEndPaintContribution(
    const Prepared& prepared,
    SegmentBreakKind kind,
    int32_t segmentIndex,
    double leadingSpacing,
    double segmentWidth) {
  const double segmentContribution = kind == SegmentBreakKind::Tab
      ? segmentWidth
      : prepared.lineEndPaintAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

double getBreakableGraphemeAdvance(
    const Prepared& prepared,
    bool hasContent,
    double baseAdvance) {
  return prepared.letterSpacing != 0 && hasContent
      ? baseAdvance + prepared.letterSpacing
      : baseAdvance;
}

double getBreakableCandidateFitWidth(
    const Prepared& prepared,
    double candidatePaintWidth) {
  return prepared.letterSpacing == 0
      ? candidatePaintWidth
      : candidatePaintWidth + prepared.letterSpacing;
}

int32_t getNextPreferredBreakIndex(
    const std::vector<double>& preferredBreaks,
    int32_t preferredBreakIndex,
    int32_t graphemeEnd) {
  int32_t index = preferredBreakIndex;
  while (index < static_cast<int32_t>(preferredBreaks.size()) &&
         preferredBreaks[index] < graphemeEnd) {
    index++;
  }
  return index;
}

// TS: `breakablePreferredBreaks[segmentIndex] ?? null` — out-of-range
// (undefined) and null both collapse to null; nullptr mirrors both.
const std::vector<double>* getPreferredBreaksOrNull(
    const std::vector<std::optional<std::vector<double>>>& breakablePreferredBreaks,
    int32_t segmentIndex) {
  if (segmentIndex < static_cast<int32_t>(breakablePreferredBreaks.size()) &&
      breakablePreferredBreaks[segmentIndex].has_value()) {
    return &*breakablePreferredBreaks[segmentIndex];
  }
  return nullptr;
}

// TS: `preferredBreaks[preferredBreakIndex] === graphemeEnd` — an
// out-of-range read yields undefined, which never equals a number.
bool preferredBreakMatches(
    const std::vector<double>* preferredBreaks,
    int32_t preferredBreakIndex,
    int32_t graphemeEnd) {
  return preferredBreaks != nullptr &&
         preferredBreakIndex >= 0 &&
         preferredBreakIndex < static_cast<int32_t>(preferredBreaks->size()) &&
         (*preferredBreaks)[preferredBreakIndex] == graphemeEnd;
}

double getTerminalLetterSpacing(
    const Prepared& prepared,
    int32_t startSegmentIndex,
    int32_t startGraphemeIndex,
    int32_t endSegmentIndex,
    int32_t endGraphemeIndex) {
  if (prepared.letterSpacing == 0) return 0;

  if (endGraphemeIndex > 0) {
    return prepared.spacingGraphemeCounts[endSegmentIndex] > 0
        ? prepared.letterSpacing
        : 0;
  }

  for (int32_t i = endSegmentIndex - 1; i >= startSegmentIndex; i--) {
    const SegmentBreakKind kind = prepared.kinds[i];
    if (kind == SegmentBreakKind::Space ||
        kind == SegmentBreakKind::ZeroWidthBreak ||
        kind == SegmentBreakKind::HardBreak) {
      continue;
    }
    if (kind == SegmentBreakKind::SoftHyphen) {
      if (i == endSegmentIndex - 1) return 0;
      continue;
    }

    if (i == startSegmentIndex && startGraphemeIndex > 0) {
      return prepared.letterSpacing;
    }

    return prepared.spacingGraphemeCounts[i] > 0
        ? prepared.letterSpacing
        : 0;
  }

  return 0;
}

double finalizeLinePaintWidth(
    const Prepared& prepared,
    double width,
    int32_t startSegmentIndex,
    int32_t startGraphemeIndex,
    int32_t endSegmentIndex,
    int32_t endGraphemeIndex) {
  return width + getTerminalLetterSpacing(
      prepared,
      startSegmentIndex,
      startGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex);
}

int32_t findChunkIndexForStart(const Prepared& prepared, int32_t segmentIndex) {
  int32_t lo = 0;
  int32_t hi = static_cast<int32_t>(prepared.chunks.size());

  while (lo < hi) {
    const int32_t mid = (lo + hi) / 2;  // Math.floor((lo + hi) / 2)
    if (segmentIndex < prepared.chunks[mid].consumedEndSegmentIndex) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return lo < static_cast<int32_t>(prepared.chunks.size()) ? lo : -1;
}

int32_t normalizeLineStartInChunk(
    const Prepared& prepared,
    int32_t chunkIndex,
    LayoutCursor& cursor) {
  int32_t segmentIndex = cursor.segmentIndex;
  if (cursor.graphemeIndex > 0) return chunkIndex;

  const PreparedLineChunk& chunk = prepared.chunks[chunkIndex];
  if (chunk.startSegmentIndex == chunk.endSegmentIndex && segmentIndex == chunk.startSegmentIndex) {
    cursor.segmentIndex = segmentIndex;
    cursor.graphemeIndex = 0;
    return chunkIndex;
  }

  if (segmentIndex < chunk.startSegmentIndex) segmentIndex = chunk.startSegmentIndex;
  segmentIndex = normalizeLineStartSegmentIndex(prepared, segmentIndex, chunk.endSegmentIndex);
  if (segmentIndex < chunk.endSegmentIndex) {
    cursor.segmentIndex = segmentIndex;
    cursor.graphemeIndex = 0;
    return chunkIndex;
  }

  if (chunk.consumedEndSegmentIndex >= static_cast<int32_t>(prepared.widths.size())) return -1;
  cursor.segmentIndex = chunk.consumedEndSegmentIndex;
  cursor.graphemeIndex = 0;
  return chunkIndex + 1;
}

}  // namespace

// Mutates `cursor` to the next renderable line start and returns its chunk index.
int32_t normalizePreparedLineStart(
    const Prepared& prepared,
    LayoutCursor& cursor) {
  if (cursor.segmentIndex >= static_cast<int32_t>(prepared.widths.size())) return -1;

  const int32_t chunkIndex = findChunkIndexForStart(prepared, cursor.segmentIndex);
  if (chunkIndex < 0) return -1;
  return normalizeLineStartInChunk(prepared, chunkIndex, cursor);
}

namespace {

int32_t normalizeLineStartChunkIndexFromHint(
    const Prepared& prepared,
    int32_t chunkIndex,
    LayoutCursor& cursor) {
  if (cursor.segmentIndex >= static_cast<int32_t>(prepared.widths.size())) return -1;

  int32_t nextChunkIndex = chunkIndex;
  while (
      nextChunkIndex < static_cast<int32_t>(prepared.chunks.size()) &&
      cursor.segmentIndex >= prepared.chunks[nextChunkIndex].consumedEndSegmentIndex) {
    nextChunkIndex++;
  }
  if (nextChunkIndex >= static_cast<int32_t>(prepared.chunks.size())) return -1;
  return normalizeLineStartInChunk(prepared, nextChunkIndex, cursor);
}

}  // namespace

int32_t countPreparedLines(const Prepared& prepared, double maxWidth) {
  return walkPreparedLinesRaw(prepared, maxWidth, nullptr);
}

namespace {

int32_t walkPreparedLinesSimple(
    const Prepared& prepared,
    double maxWidth,
    const InternalLineVisitor* onLine) {
  const std::vector<double>& widths = prepared.widths;
  const std::vector<SegmentBreakKind>& kinds = prepared.kinds;
  const std::vector<std::optional<std::vector<double>>>& breakableFitAdvances =
      prepared.breakableFitAdvances;
  const std::vector<std::optional<std::vector<double>>>& breakablePreferredBreaks =
      prepared.breakablePreferredBreaks;
  if (widths.empty()) return 0;

  const EngineProfile& engineProfile = getEngineProfile();
  const double lineFitEpsilon = engineProfile.lineFitEpsilon;
  const double fitLimit = maxWidth + lineFitEpsilon;

  int32_t lineCount = 0;
  double lineW = 0;
  bool hasContent = false;
  int32_t lineStartSegmentIndex = 0;
  int32_t lineStartGraphemeIndex = 0;
  int32_t lineEndSegmentIndex = 0;
  int32_t lineEndGraphemeIndex = 0;
  int32_t pendingBreakSegmentIndex = -1;
  double pendingBreakPaintWidth = 0;

  auto clearPendingBreak = [&]() -> void {
    pendingBreakSegmentIndex = -1;
    pendingBreakPaintWidth = 0;
  };

  // TS defaults: endSegmentIndex = lineEndSegmentIndex,
  // endGraphemeIndex = lineEndGraphemeIndex, width = lineW — call sites pass
  // the current values explicitly (defaults are evaluated at call time in JS).
  auto emitCurrentLine = [&](
      int32_t endSegmentIndex,
      int32_t endGraphemeIndex,
      double width) -> void {
    lineCount++;
    if (onLine != nullptr) {
      (*onLine)(
          width,
          lineStartSegmentIndex,
          lineStartGraphemeIndex,
          endSegmentIndex,
          endGraphemeIndex);
    }
    lineW = 0;
    hasContent = false;
    clearPendingBreak();
  };

  auto startLineAtSegment = [&](int32_t segmentIndex, double width) -> void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = 0;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
    lineW = width;
  };

  auto startLineAtGrapheme = [&](int32_t segmentIndex, int32_t graphemeIndex, double width) -> void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = graphemeIndex;
    lineEndSegmentIndex = segmentIndex;
    lineEndGraphemeIndex = graphemeIndex + 1;
    lineW = width;
  };

  auto appendWholeSegment = [&](int32_t segmentIndex, double width) -> void {
    if (!hasContent) {
      startLineAtSegment(segmentIndex, width);
      return;
    }
    lineW += width;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
  };

  auto appendBreakableSegmentFrom = [&](int32_t segmentIndex, int32_t startGraphemeIndex) -> void {
    const std::vector<double>& fitAdvances = *breakableFitAdvances[segmentIndex];
    const std::vector<double>* preferredBreaks =
        getPreferredBreaksOrNull(breakablePreferredBreaks, segmentIndex);
    int32_t preferredBreakIndex = preferredBreaks == nullptr
        ? -1
        : getNextPreferredBreakIndex(*preferredBreaks, 0, startGraphemeIndex + 1);
    int32_t lastPreferredBreakEnd = -1;
    double lastPreferredBreakWidth = 0;

    int32_t g = startGraphemeIndex;
    while (g < static_cast<int32_t>(fitAdvances.size())) {
      const double gw = fitAdvances[g];

      if (!hasContent) {
        startLineAtGrapheme(segmentIndex, g, gw);
      } else if (lineW + gw > fitLimit) {
        if (preferredBreaks != nullptr && lastPreferredBreakEnd > startGraphemeIndex) {
          emitCurrentLine(segmentIndex, lastPreferredBreakEnd, lastPreferredBreakWidth);
          g = lastPreferredBreakEnd;
          preferredBreakIndex = getNextPreferredBreakIndex(*preferredBreaks, preferredBreakIndex, g + 1);
          lastPreferredBreakEnd = -1;
          lastPreferredBreakWidth = 0;
          continue;
        }
        emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, lineW);
        startLineAtGrapheme(segmentIndex, g, gw);
      } else {
        lineW += gw;
        lineEndSegmentIndex = segmentIndex;
        lineEndGraphemeIndex = g + 1;
      }

      const int32_t graphemeEnd = g + 1;
      if (preferredBreakMatches(preferredBreaks, preferredBreakIndex, graphemeEnd)) {
        lastPreferredBreakEnd = graphemeEnd;
        lastPreferredBreakWidth = lineW;
        preferredBreakIndex++;
      }
      g++;
    }

    if (hasContent && lineEndSegmentIndex == segmentIndex &&
        lineEndGraphemeIndex == static_cast<int32_t>(fitAdvances.size())) {
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
  };

  int32_t i = 0;
  while (i < static_cast<int32_t>(widths.size())) {
    if (!hasContent) {
      i = normalizeLineStartSegmentIndex(prepared, i);
      if (i >= static_cast<int32_t>(widths.size())) break;
    }

    const double w = widths[i];
    const SegmentBreakKind kind = kinds[i];
    const bool breakAfter = breaksAfter(kind);

    if (!hasContent) {
      if (w > fitLimit && breakableFitAdvances[i].has_value()) {
        appendBreakableSegmentFrom(i, 0);
      } else {
        startLineAtSegment(i, w);
      }
      if (breakAfter) {
        pendingBreakSegmentIndex = i + 1;
        pendingBreakPaintWidth = lineW - w;
      }
      i++;
      continue;
    }

    const double newW = lineW + w;
    if (newW > fitLimit) {
      if (breakAfter) {
        appendWholeSegment(i, w);
        emitCurrentLine(i + 1, 0, lineW - w);
        i++;
        continue;
      }

      if (pendingBreakSegmentIndex >= 0) {
        if (
            lineEndSegmentIndex > pendingBreakSegmentIndex ||
            (lineEndSegmentIndex == pendingBreakSegmentIndex && lineEndGraphemeIndex > 0)) {
          emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, lineW);
          continue;
        }
        emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
        continue;
      }

      if (w > fitLimit && breakableFitAdvances[i].has_value()) {
        emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, lineW);
        appendBreakableSegmentFrom(i, 0);
        i++;
        continue;
      }

      emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, lineW);
      continue;
    }

    appendWholeSegment(i, w);
    if (breakAfter) {
      pendingBreakSegmentIndex = i + 1;
      pendingBreakPaintWidth = lineW - w;
    }
    i++;
  }

  if (hasContent) emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, lineW);
  return lineCount;
}

}  // namespace

int32_t walkPreparedLinesRaw(
    const Prepared& prepared,
    double maxWidth,
    const InternalLineVisitor* onLine) {
  if (prepared.simpleLineWalkFastPath) {
    return walkPreparedLinesSimple(prepared, maxWidth, onLine);
  }

  const std::vector<double>& widths = prepared.widths;
  const std::vector<SegmentBreakKind>& kinds = prepared.kinds;
  const std::vector<std::optional<std::vector<double>>>& breakableFitAdvances =
      prepared.breakableFitAdvances;
  const std::vector<std::optional<std::vector<double>>>& breakablePreferredBreaks =
      prepared.breakablePreferredBreaks;
  const double discretionaryHyphenWidth = prepared.discretionaryHyphenWidth;
  const std::vector<PreparedLineChunk>& chunks = prepared.chunks;
  if (widths.empty() || chunks.empty()) return 0;

  const EngineProfile& engineProfile = getEngineProfile();
  const double lineFitEpsilon = engineProfile.lineFitEpsilon;
  const double fitLimit = maxWidth + lineFitEpsilon;

  int32_t lineCount = 0;
  double lineW = 0;
  bool hasContent = false;
  int32_t lineStartSegmentIndex = 0;
  int32_t lineStartGraphemeIndex = 0;
  int32_t lineEndSegmentIndex = 0;
  int32_t lineEndGraphemeIndex = 0;
  int32_t pendingBreakSegmentIndex = -1;
  double pendingBreakFitWidth = 0;
  double pendingBreakPaintWidth = 0;
  std::optional<SegmentBreakKind> pendingBreakKind = std::nullopt;

  auto clearPendingBreak = [&]() -> void {
    pendingBreakSegmentIndex = -1;
    pendingBreakFitWidth = 0;
    pendingBreakPaintWidth = 0;
    pendingBreakKind = std::nullopt;
  };

  auto getCurrentLinePaintWidth = [&]() -> double {
    return (
        pendingBreakKind == SegmentBreakKind::SoftHyphen &&
        pendingBreakSegmentIndex == lineEndSegmentIndex &&
        lineEndGraphemeIndex == 0)
        ? pendingBreakPaintWidth
        : lineW;
  };

  // TS defaults: endSegmentIndex = lineEndSegmentIndex,
  // endGraphemeIndex = lineEndGraphemeIndex; width? is optional
  // (nullopt → getCurrentLinePaintWidth(), evaluated inside the onLine branch
  // like the TS `width ?? getCurrentLinePaintWidth()`).
  auto emitCurrentLine = [&](
      int32_t endSegmentIndex,
      int32_t endGraphemeIndex,
      std::optional<double> width) -> void {
    lineCount++;
    if (onLine != nullptr) {
      (*onLine)(
          finalizeLinePaintWidth(
              prepared,
              width.has_value() ? *width : getCurrentLinePaintWidth(),
              lineStartSegmentIndex,
              lineStartGraphemeIndex,
              endSegmentIndex,
              endGraphemeIndex),
          lineStartSegmentIndex,
          lineStartGraphemeIndex,
          endSegmentIndex,
          endGraphemeIndex);
    }
    lineW = 0;
    hasContent = false;
    clearPendingBreak();
  };

  auto startLineAtSegment = [&](int32_t segmentIndex, double width) -> void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = 0;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
    lineW = width;
  };

  auto startLineAtGrapheme = [&](int32_t segmentIndex, int32_t graphemeIndex, double width) -> void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = graphemeIndex;
    lineEndSegmentIndex = segmentIndex;
    lineEndGraphemeIndex = graphemeIndex + 1;
    lineW = width;
  };

  auto appendWholeSegment = [&](int32_t segmentIndex, double advance) -> void {
    if (!hasContent) {
      startLineAtSegment(segmentIndex, advance);
      return;
    }
    lineW += advance;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
  };

  auto updatePendingBreakForWholeSegment = [&](
      SegmentBreakKind kind,
      bool breakAfter,
      int32_t segmentIndex,
      double segmentWidth,
      double leadingSpacing,
      double advance) -> void {
    if (!breakAfter) return;
    const double fitAdvance = getBreakOpportunityFitContribution(prepared, kind, segmentIndex, leadingSpacing);
    const double paintAdvance = getLineEndPaintContribution(prepared, kind, segmentIndex, leadingSpacing, segmentWidth);
    pendingBreakSegmentIndex = segmentIndex + 1;
    pendingBreakFitWidth = lineW - advance + fitAdvance;
    pendingBreakPaintWidth = lineW - advance + paintAdvance;
    pendingBreakKind = kind;
  };

  auto appendBreakableSegmentFrom = [&](int32_t segmentIndex, int32_t startGraphemeIndex) -> void {
    const std::vector<double>& fitAdvances = *breakableFitAdvances[segmentIndex];
    const std::vector<double>* preferredBreaks =
        getPreferredBreaksOrNull(breakablePreferredBreaks, segmentIndex);
    int32_t preferredBreakIndex = preferredBreaks == nullptr
        ? -1
        : getNextPreferredBreakIndex(*preferredBreaks, 0, startGraphemeIndex + 1);
    int32_t lastPreferredBreakEnd = -1;
    double lastPreferredBreakWidth = 0;

    int32_t g = startGraphemeIndex;
    while (g < static_cast<int32_t>(fitAdvances.size())) {
      const double baseGw = fitAdvances[g];

      if (!hasContent) {
        startLineAtGrapheme(segmentIndex, g, baseGw);
      } else {
        const double gw = getBreakableGraphemeAdvance(prepared, true, baseGw);
        const double candidatePaintWidth = lineW + gw;
        if (getBreakableCandidateFitWidth(prepared, candidatePaintWidth) > fitLimit) {
          if (preferredBreaks != nullptr && lastPreferredBreakEnd > startGraphemeIndex) {
            emitCurrentLine(segmentIndex, lastPreferredBreakEnd, lastPreferredBreakWidth);
            g = lastPreferredBreakEnd;
            preferredBreakIndex = getNextPreferredBreakIndex(*preferredBreaks, preferredBreakIndex, g + 1);
            lastPreferredBreakEnd = -1;
            lastPreferredBreakWidth = 0;
            continue;
          }
          emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, std::nullopt);
          startLineAtGrapheme(segmentIndex, g, baseGw);
        } else {
          lineW = candidatePaintWidth;
          lineEndSegmentIndex = segmentIndex;
          lineEndGraphemeIndex = g + 1;
        }
      }

      const int32_t graphemeEnd = g + 1;
      if (preferredBreakMatches(preferredBreaks, preferredBreakIndex, graphemeEnd)) {
        lastPreferredBreakEnd = graphemeEnd;
        lastPreferredBreakWidth = lineW;
        preferredBreakIndex++;
      }
      g++;
    }

    if (hasContent && lineEndSegmentIndex == segmentIndex &&
        lineEndGraphemeIndex == static_cast<int32_t>(fitAdvances.size())) {
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
  };

  auto emitEmptyChunk = [&](const PreparedLineChunk& chunk) -> void {
    lineCount++;
    if (onLine != nullptr) {
      (*onLine)(0, chunk.startSegmentIndex, 0, chunk.consumedEndSegmentIndex, 0);
    }
    clearPendingBreak();
  };

  for (int32_t chunkIndex = 0; chunkIndex < static_cast<int32_t>(chunks.size()); chunkIndex++) {
    const PreparedLineChunk& chunk = chunks[chunkIndex];
    if (chunk.startSegmentIndex == chunk.endSegmentIndex) {
      emitEmptyChunk(chunk);
      continue;
    }

    hasContent = false;
    lineW = 0;
    lineStartSegmentIndex = chunk.startSegmentIndex;
    lineStartGraphemeIndex = 0;
    lineEndSegmentIndex = chunk.startSegmentIndex;
    lineEndGraphemeIndex = 0;
    clearPendingBreak();

    int32_t i = chunk.startSegmentIndex;
    while (i < chunk.endSegmentIndex) {
      if (!hasContent) {
        i = normalizeLineStartSegmentIndex(prepared, i, chunk.endSegmentIndex);
        if (i >= chunk.endSegmentIndex) break;
      }

      const SegmentBreakKind kind = kinds[i];
      const bool breakAfter = breaksAfter(kind);
      const double leadingSpacing = getLeadingLetterSpacing(prepared, hasContent, i);
      const double w = kind == SegmentBreakKind::Tab
          ? getTabAdvance(lineW + leadingSpacing, prepared.tabStopAdvance)
          : widths[i];
      const double advance = leadingSpacing + w;
      const double fitAdvance = getWholeSegmentFitContribution(prepared, kind, i, leadingSpacing, w);

      if (kind == SegmentBreakKind::SoftHyphen) {
        if (hasContent) {
          lineEndSegmentIndex = i + 1;
          lineEndGraphemeIndex = 0;
          pendingBreakSegmentIndex = i + 1;
          pendingBreakFitWidth = lineW + discretionaryHyphenWidth;
          pendingBreakPaintWidth = lineW + discretionaryHyphenWidth;
          pendingBreakKind = kind;
        }
        i++;
        continue;
      }

      if (!hasContent) {
        if (fitAdvance > fitLimit && breakableFitAdvances[i].has_value()) {
          appendBreakableSegmentFrom(i, 0);
        } else {
          startLineAtSegment(i, w);
        }
        updatePendingBreakForWholeSegment(kind, breakAfter, i, w, leadingSpacing, advance);
        i++;
        continue;
      }

      const double newFitW = lineW + fitAdvance;
      if (newFitW > fitLimit) {
        const double currentBreakFitWidth =
            lineW + getBreakOpportunityFitContribution(prepared, kind, i, leadingSpacing);
        const double currentBreakPaintWidth =
            lineW + getLineEndPaintContribution(prepared, kind, i, leadingSpacing, w);

        if (
            pendingBreakKind == SegmentBreakKind::SoftHyphen &&
            engineProfile.preferEarlySoftHyphenBreak &&
            pendingBreakFitWidth <= fitLimit) {
          emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
          continue;
        }

        if (breakAfter && currentBreakFitWidth <= fitLimit) {
          appendWholeSegment(i, advance);
          emitCurrentLine(i + 1, 0, currentBreakPaintWidth);
          i++;
          continue;
        }

        if (pendingBreakSegmentIndex >= 0 && pendingBreakFitWidth <= fitLimit) {
          if (
              lineEndSegmentIndex > pendingBreakSegmentIndex ||
              (lineEndSegmentIndex == pendingBreakSegmentIndex && lineEndGraphemeIndex > 0)) {
            emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, std::nullopt);
            continue;
          }
          const int32_t nextSegmentIndex = pendingBreakSegmentIndex;
          emitCurrentLine(nextSegmentIndex, 0, pendingBreakPaintWidth);
          i = nextSegmentIndex;
          continue;
        }

        if (fitAdvance > fitLimit && breakableFitAdvances[i].has_value()) {
          emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, std::nullopt);
          appendBreakableSegmentFrom(i, 0);
          i++;
          continue;
        }

        emitCurrentLine(lineEndSegmentIndex, lineEndGraphemeIndex, std::nullopt);
        continue;
      }

      appendWholeSegment(i, advance);
      updatePendingBreakForWholeSegment(kind, breakAfter, i, w, leadingSpacing, advance);
      i++;
    }

    if (hasContent) {
      const double finalPaintWidth =
          pendingBreakSegmentIndex == chunk.consumedEndSegmentIndex
              ? pendingBreakPaintWidth
              : lineW;
      emitCurrentLine(chunk.consumedEndSegmentIndex, 0, finalPaintWidth);
    }
  }

  return lineCount;
}

namespace {

std::optional<double> stepPreparedChunkLineGeometry(
    const Prepared& prepared,
    LayoutCursor& cursor,
    int32_t chunkIndex,
    double maxWidth) {
  const PreparedLineChunk& chunk = prepared.chunks[chunkIndex];
  if (chunk.startSegmentIndex == chunk.endSegmentIndex) {
    cursor.segmentIndex = chunk.consumedEndSegmentIndex;
    cursor.graphemeIndex = 0;
    return 0.0;
  }

  const std::vector<double>& widths = prepared.widths;
  const std::vector<SegmentBreakKind>& kinds = prepared.kinds;
  const std::vector<std::optional<std::vector<double>>>& breakableFitAdvances =
      prepared.breakableFitAdvances;
  const std::vector<std::optional<std::vector<double>>>& breakablePreferredBreaks =
      prepared.breakablePreferredBreaks;
  const double discretionaryHyphenWidth = prepared.discretionaryHyphenWidth;
  const EngineProfile& engineProfile = getEngineProfile();
  const double lineFitEpsilon = engineProfile.lineFitEpsilon;
  const double fitLimit = maxWidth + lineFitEpsilon;

  const int32_t lineStartSegmentIndex = cursor.segmentIndex;
  const int32_t lineStartGraphemeIndex = cursor.graphemeIndex;
  double lineW = 0;
  bool hasContent = false;
  int32_t lineEndSegmentIndex = cursor.segmentIndex;
  int32_t lineEndGraphemeIndex = cursor.graphemeIndex;
  int32_t pendingBreakSegmentIndex = -1;
  double pendingBreakFitWidth = 0;
  double pendingBreakPaintWidth = 0;
  std::optional<SegmentBreakKind> pendingBreakKind = std::nullopt;

  auto getCurrentLinePaintWidth = [&]() -> double {
    return (
        pendingBreakKind == SegmentBreakKind::SoftHyphen &&
        pendingBreakSegmentIndex == lineEndSegmentIndex &&
        lineEndGraphemeIndex == 0)
        ? pendingBreakPaintWidth
        : lineW;
  };

  // TS defaults: endSegmentIndex = lineEndSegmentIndex,
  // endGraphemeIndex = lineEndGraphemeIndex, width = getCurrentLinePaintWidth()
  // — no-arg call sites pass those explicitly (defaults evaluate at call time).
  auto finishLine = [&](
      int32_t endSegmentIndex,
      int32_t endGraphemeIndex,
      double width) -> std::optional<double> {
    if (!hasContent) return std::nullopt;
    cursor.segmentIndex = endSegmentIndex;
    cursor.graphemeIndex = endGraphemeIndex;
    return finalizeLinePaintWidth(
        prepared,
        width,
        lineStartSegmentIndex,
        lineStartGraphemeIndex,
        endSegmentIndex,
        endGraphemeIndex);
  };

  auto startLineAtSegment = [&](int32_t segmentIndex, double width) -> void {
    hasContent = true;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
    lineW = width;
  };

  auto startLineAtGrapheme = [&](int32_t segmentIndex, int32_t graphemeIndex, double width) -> void {
    hasContent = true;
    lineEndSegmentIndex = segmentIndex;
    lineEndGraphemeIndex = graphemeIndex + 1;
    lineW = width;
  };

  auto appendWholeSegment = [&](int32_t segmentIndex, double advance) -> void {
    if (!hasContent) {
      startLineAtSegment(segmentIndex, advance);
      return;
    }
    lineW += advance;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
  };

  auto updatePendingBreakForWholeSegment = [&](
      SegmentBreakKind kind,
      bool breakAfter,
      int32_t segmentIndex,
      double segmentWidth,
      double leadingSpacing,
      double advance) -> void {
    if (!breakAfter) return;
    const double fitAdvance = getBreakOpportunityFitContribution(prepared, kind, segmentIndex, leadingSpacing);
    const double paintAdvance = getLineEndPaintContribution(prepared, kind, segmentIndex, leadingSpacing, segmentWidth);
    pendingBreakSegmentIndex = segmentIndex + 1;
    pendingBreakFitWidth = lineW - advance + fitAdvance;
    pendingBreakPaintWidth = lineW - advance + paintAdvance;
    pendingBreakKind = kind;
  };

  auto appendBreakableSegmentFrom = [&](
      int32_t segmentIndex, int32_t startGraphemeIndex) -> std::optional<double> {
    const std::vector<double>& fitAdvances = *breakableFitAdvances[segmentIndex];
    const std::vector<double>* preferredBreaks =
        getPreferredBreaksOrNull(breakablePreferredBreaks, segmentIndex);
    int32_t preferredBreakIndex = preferredBreaks == nullptr
        ? -1
        : getNextPreferredBreakIndex(*preferredBreaks, 0, startGraphemeIndex + 1);
    int32_t lastPreferredBreakEnd = -1;
    double lastPreferredBreakWidth = 0;

    for (int32_t g = startGraphemeIndex; g < static_cast<int32_t>(fitAdvances.size()); g++) {
      const double baseGw = fitAdvances[g];

      if (!hasContent) {
        startLineAtGrapheme(segmentIndex, g, baseGw);
      } else {
        const double gw = getBreakableGraphemeAdvance(prepared, true, baseGw);
        const double candidatePaintWidth = lineW + gw;
        if (getBreakableCandidateFitWidth(prepared, candidatePaintWidth) > fitLimit) {
          if (preferredBreaks != nullptr && lastPreferredBreakEnd > startGraphemeIndex) {
            return finishLine(segmentIndex, lastPreferredBreakEnd, lastPreferredBreakWidth);
          }
          return finishLine(lineEndSegmentIndex, lineEndGraphemeIndex, getCurrentLinePaintWidth());
        }

        lineW = candidatePaintWidth;
        lineEndSegmentIndex = segmentIndex;
        lineEndGraphemeIndex = g + 1;
      }

      const int32_t graphemeEnd = g + 1;
      if (preferredBreakMatches(preferredBreaks, preferredBreakIndex, graphemeEnd)) {
        lastPreferredBreakEnd = graphemeEnd;
        lastPreferredBreakWidth = lineW;
        preferredBreakIndex++;
      }
    }

    if (hasContent && lineEndSegmentIndex == segmentIndex &&
        lineEndGraphemeIndex == static_cast<int32_t>(fitAdvances.size())) {
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
    return std::nullopt;
  };

  auto maybeFinishAtSoftHyphen = [&]() -> std::optional<double> {
    if (pendingBreakKind != SegmentBreakKind::SoftHyphen || pendingBreakSegmentIndex < 0) {
      return std::nullopt;
    }

    if (pendingBreakFitWidth <= fitLimit) {
      return finishLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
    }

    return std::nullopt;
  };

  for (int32_t i = cursor.segmentIndex; i < chunk.endSegmentIndex; i++) {
    const SegmentBreakKind kind = kinds[i];
    const bool breakAfter = breaksAfter(kind);
    const int32_t startGraphemeIndex = i == cursor.segmentIndex ? cursor.graphemeIndex : 0;
    const double leadingSpacing = getLeadingLetterSpacing(prepared, hasContent, i);
    const double w = kind == SegmentBreakKind::Tab
        ? getTabAdvance(lineW + leadingSpacing, prepared.tabStopAdvance)
        : widths[i];
    const double advance = leadingSpacing + w;
    const double fitAdvance = getWholeSegmentFitContribution(prepared, kind, i, leadingSpacing, w);

    if (kind == SegmentBreakKind::SoftHyphen && startGraphemeIndex == 0) {
      if (hasContent) {
        lineEndSegmentIndex = i + 1;
        lineEndGraphemeIndex = 0;
        pendingBreakSegmentIndex = i + 1;
        pendingBreakFitWidth = lineW + discretionaryHyphenWidth;
        pendingBreakPaintWidth = lineW + discretionaryHyphenWidth;
        pendingBreakKind = kind;
      }
      continue;
    }

    if (!hasContent) {
      if (startGraphemeIndex > 0) {
        const std::optional<double> line = appendBreakableSegmentFrom(i, startGraphemeIndex);
        if (line.has_value()) return line;
      } else if (fitAdvance > fitLimit && breakableFitAdvances[i].has_value()) {
        const std::optional<double> line = appendBreakableSegmentFrom(i, 0);
        if (line.has_value()) return line;
      } else {
        startLineAtSegment(i, w);
      }
      updatePendingBreakForWholeSegment(kind, breakAfter, i, w, leadingSpacing, advance);
      continue;
    }

    const double newFitW = lineW + fitAdvance;
    if (newFitW > fitLimit) {
      const double currentBreakFitWidth =
          lineW + getBreakOpportunityFitContribution(prepared, kind, i, leadingSpacing);
      const double currentBreakPaintWidth =
          lineW + getLineEndPaintContribution(prepared, kind, i, leadingSpacing, w);

      if (
          pendingBreakKind == SegmentBreakKind::SoftHyphen &&
          engineProfile.preferEarlySoftHyphenBreak &&
          pendingBreakFitWidth <= fitLimit) {
        return finishLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
      }

      const std::optional<double> softBreakLine = maybeFinishAtSoftHyphen();
      if (softBreakLine.has_value()) return softBreakLine;

      if (breakAfter && currentBreakFitWidth <= fitLimit) {
        appendWholeSegment(i, advance);
        return finishLine(i + 1, 0, currentBreakPaintWidth);
      }

      if (pendingBreakSegmentIndex >= 0 && pendingBreakFitWidth <= fitLimit) {
        if (
            lineEndSegmentIndex > pendingBreakSegmentIndex ||
            (lineEndSegmentIndex == pendingBreakSegmentIndex && lineEndGraphemeIndex > 0)) {
          return finishLine(lineEndSegmentIndex, lineEndGraphemeIndex, getCurrentLinePaintWidth());
        }
        return finishLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
      }

      if (fitAdvance > fitLimit && breakableFitAdvances[i].has_value()) {
        const std::optional<double> currentLine =
            finishLine(lineEndSegmentIndex, lineEndGraphemeIndex, getCurrentLinePaintWidth());
        if (currentLine.has_value()) return currentLine;
        const std::optional<double> line = appendBreakableSegmentFrom(i, 0);
        if (line.has_value()) return line;
      }

      return finishLine(lineEndSegmentIndex, lineEndGraphemeIndex, getCurrentLinePaintWidth());
    }

    appendWholeSegment(i, advance);
    updatePendingBreakForWholeSegment(kind, breakAfter, i, w, leadingSpacing, advance);
  }

  if (pendingBreakSegmentIndex == chunk.consumedEndSegmentIndex && lineEndGraphemeIndex == 0) {
    return finishLine(chunk.consumedEndSegmentIndex, 0, pendingBreakPaintWidth);
  }

  return finishLine(chunk.consumedEndSegmentIndex, 0, lineW);
}

std::optional<double> stepPreparedSimpleLineGeometry(
    const Prepared& prepared,
    LayoutCursor& cursor,
    double maxWidth) {
  const std::vector<double>& widths = prepared.widths;
  const std::vector<SegmentBreakKind>& kinds = prepared.kinds;
  const std::vector<std::optional<std::vector<double>>>& breakableFitAdvances =
      prepared.breakableFitAdvances;
  const std::vector<std::optional<std::vector<double>>>& breakablePreferredBreaks =
      prepared.breakablePreferredBreaks;
  const EngineProfile& engineProfile = getEngineProfile();
  const double lineFitEpsilon = engineProfile.lineFitEpsilon;
  const double fitLimit = maxWidth + lineFitEpsilon;

  double lineW = 0;
  bool hasContent = false;
  int32_t lineEndSegmentIndex = cursor.segmentIndex;
  int32_t lineEndGraphemeIndex = cursor.graphemeIndex;
  int32_t pendingBreakSegmentIndex = -1;
  double pendingBreakPaintWidth = 0;

  for (int32_t i = cursor.segmentIndex; i < static_cast<int32_t>(widths.size()); i++) {
    const SegmentBreakKind kind = kinds[i];
    const bool breakAfter = breaksAfter(kind);
    const int32_t startGraphemeIndex = i == cursor.segmentIndex ? cursor.graphemeIndex : 0;
    const std::optional<std::vector<double>>& breakableFitAdvance = breakableFitAdvances[i];
    const double w = widths[i];

    if (!hasContent) {
      if (startGraphemeIndex > 0 || (w > fitLimit && breakableFitAdvance.has_value())) {
        const std::vector<double>& fitAdvances = *breakableFitAdvance;
        const std::vector<double>* preferredBreaks =
            getPreferredBreaksOrNull(breakablePreferredBreaks, i);
        int32_t preferredBreakIndex = preferredBreaks == nullptr
            ? -1
            : getNextPreferredBreakIndex(*preferredBreaks, 0, startGraphemeIndex + 1);
        int32_t lastPreferredBreakEnd = -1;
        double lastPreferredBreakWidth = 0;
        const double firstGraphemeWidth = fitAdvances[startGraphemeIndex];

        hasContent = true;
        lineW = firstGraphemeWidth;
        lineEndSegmentIndex = i;
        lineEndGraphemeIndex = startGraphemeIndex + 1;
        if (preferredBreakMatches(preferredBreaks, preferredBreakIndex, lineEndGraphemeIndex)) {
          lastPreferredBreakEnd = lineEndGraphemeIndex;
          lastPreferredBreakWidth = lineW;
          preferredBreakIndex++;
        }

        for (int32_t g = startGraphemeIndex + 1; g < static_cast<int32_t>(fitAdvances.size()); g++) {
          const double gw = fitAdvances[g];
          if (lineW + gw > fitLimit) {
            if (preferredBreaks != nullptr && lastPreferredBreakEnd > startGraphemeIndex) {
              cursor.segmentIndex = i;
              cursor.graphemeIndex = lastPreferredBreakEnd;
              return lastPreferredBreakWidth;
            }
            cursor.segmentIndex = lineEndSegmentIndex;
            cursor.graphemeIndex = lineEndGraphemeIndex;
            return lineW;
          }
          lineW += gw;
          lineEndSegmentIndex = i;
          lineEndGraphemeIndex = g + 1;
          if (preferredBreakMatches(preferredBreaks, preferredBreakIndex, lineEndGraphemeIndex)) {
            lastPreferredBreakEnd = lineEndGraphemeIndex;
            lastPreferredBreakWidth = lineW;
            preferredBreakIndex++;
          }
        }

        if (lineEndSegmentIndex == i &&
            lineEndGraphemeIndex == static_cast<int32_t>(fitAdvances.size())) {
          lineEndSegmentIndex = i + 1;
          lineEndGraphemeIndex = 0;
        }
      } else {
        hasContent = true;
        lineW = w;
        lineEndSegmentIndex = i + 1;
        lineEndGraphemeIndex = 0;
      }
      if (breakAfter) {
        pendingBreakSegmentIndex = i + 1;
        pendingBreakPaintWidth = lineW - w;
      }
      continue;
    }

    if (lineW + w > fitLimit) {
      if (breakAfter) {
        cursor.segmentIndex = i + 1;
        cursor.graphemeIndex = 0;
        return lineW;
      }

      if (pendingBreakSegmentIndex >= 0) {
        if (
            lineEndSegmentIndex > pendingBreakSegmentIndex ||
            (lineEndSegmentIndex == pendingBreakSegmentIndex && lineEndGraphemeIndex > 0)) {
          cursor.segmentIndex = lineEndSegmentIndex;
          cursor.graphemeIndex = lineEndGraphemeIndex;
          return lineW;
        }
        cursor.segmentIndex = pendingBreakSegmentIndex;
        cursor.graphemeIndex = 0;
        return pendingBreakPaintWidth;
      }

      cursor.segmentIndex = lineEndSegmentIndex;
      cursor.graphemeIndex = lineEndGraphemeIndex;
      return lineW;
    }

    lineW += w;
    lineEndSegmentIndex = i + 1;
    lineEndGraphemeIndex = 0;
    if (breakAfter) {
      pendingBreakSegmentIndex = i + 1;
      pendingBreakPaintWidth = lineW - w;
    }
  }

  if (!hasContent) return std::nullopt;
  cursor.segmentIndex = lineEndSegmentIndex;
  cursor.graphemeIndex = lineEndGraphemeIndex;
  return lineW;
}

}  // namespace

std::optional<double> stepPreparedLineGeometryFromChunk(
    const Prepared& prepared,
    LayoutCursor& cursor,
    int32_t chunkIndex,
    double maxWidth) {
  if (prepared.simpleLineWalkFastPath) {
    return stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth);
  }

  return stepPreparedChunkLineGeometry(prepared, cursor, chunkIndex, maxWidth);
}

std::optional<double> stepPreparedLineGeometry(
    const Prepared& prepared,
    LayoutCursor& cursor,
    double maxWidth) {
  const int32_t chunkIndex = normalizePreparedLineStart(prepared, cursor);
  if (chunkIndex < 0) return std::nullopt;
  return stepPreparedLineGeometryFromChunk(prepared, cursor, chunkIndex, maxWidth);
}

LineStats measurePreparedLineGeometry(
    const Prepared& prepared,
    double maxWidth) {
  if (prepared.widths.empty()) {
    return LineStats{
        /*lineCount=*/0,
        /*maxLineWidth=*/0,
    };
  }

  LayoutCursor cursor{
      /*segmentIndex=*/0,
      /*graphemeIndex=*/0,
  };
  int32_t lineCount = 0;
  double maxLineWidth = 0;

  if (!prepared.simpleLineWalkFastPath) {
    int32_t chunkIndex = normalizePreparedLineStart(prepared, cursor);
    while (chunkIndex >= 0) {
      const std::optional<double> lineWidth =
          stepPreparedChunkLineGeometry(prepared, cursor, chunkIndex, maxWidth);
      if (!lineWidth.has_value()) {
        return LineStats{
            lineCount,
            maxLineWidth,
        };
      }
      lineCount++;
      if (*lineWidth > maxLineWidth) maxLineWidth = *lineWidth;
      chunkIndex = normalizeLineStartChunkIndexFromHint(prepared, chunkIndex, cursor);
    }
    return LineStats{
        lineCount,
        maxLineWidth,
    };
  }

  while (true) {
    const std::optional<double> lineWidth = stepPreparedLineGeometry(prepared, cursor, maxWidth);
    if (!lineWidth.has_value()) {
      return LineStats{
          lineCount,
          maxLineWidth,
      };
    }
    lineCount++;
    if (*lineWidth > maxLineWidth) maxLineWidth = *lineWidth;
  }
}

}  // namespace pretext
