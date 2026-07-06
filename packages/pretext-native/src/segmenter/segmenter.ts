// Drop-in Intl.Segmenter replacement for engines that lack one (Hermes).
//
// Shape-compatible with the parts pretext consumes: construct with
// (locale, { granularity }), call segment(text), iterate objects carrying
// { segment, index, isWordLike?, input }. Locale is accepted and ignored —
// our segmentation is locale-independent (that's the price of shipping
// without ICU; pretext only ever passes undefined anyway).

import { iterateGraphemes } from './grapheme.js';
import { iterateWords } from './word.js';

export type PretextSegmentData = {
  segment: string;
  index: number;
  input: string;
  isWordLike?: boolean;
};

export type PretextSegmenterGranularity = 'grapheme' | 'word' | 'sentence';

export type PretextSegmenterOptions = {
  granularity?: PretextSegmenterGranularity;
  localeMatcher?: string; // accepted for Intl signature compatibility, unused
};

function* graphemeSegments(input: string): Generator<PretextSegmentData> {
  for (const g of iterateGraphemes(input)) {
    // Intl leaves isWordLike undefined for grapheme granularity; we simply
    // omit it.
    yield { segment: g.segment, index: g.index, input };
  }
}

function* wordSegments(input: string): Generator<PretextSegmentData> {
  for (const w of iterateWords(input)) {
    yield { segment: w.segment, index: w.index, input, isWordLike: w.isWordLike };
  }
}

export class PretextSegmenter {
  private readonly granularity: 'grapheme' | 'word';

  constructor(_locales?: string | string[], options?: PretextSegmenterOptions) {
    const granularity = options?.granularity ?? 'grapheme';
    if (granularity === 'sentence') {
      // pretext never asks for sentences; be loud rather than silently wrong.
      throw new Error('pretext-native: PretextSegmenter does not support sentence granularity.');
    }
    this.granularity = granularity;
  }

  segment(input: string): Iterable<PretextSegmentData> {
    const granularity = this.granularity;
    // A fresh generator per iteration, matching Intl's Segments object which
    // is re-iterable.
    return {
      [Symbol.iterator]: () => (granularity === 'word' ? wordSegments(input) : graphemeSegments(input)),
    };
  }

  resolvedOptions(): { locale: string; granularity: 'grapheme' | 'word' } {
    return { locale: 'und', granularity: this.granularity };
  }
}
