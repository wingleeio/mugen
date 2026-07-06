import { describe, expect, it } from 'vitest';
import { PretextSegmenter, type PretextSegmentData } from './segmenter.js';

// Tests exercise the exported class directly — the global installation path
// is covered by the forced-segmenter end-to-end test. All non-ASCII text is
// written with explicit escapes so composed vs decomposed forms are
// unambiguous in source.

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'; // man+ZWJ+woman+ZWJ+girl
const THUMBS_MEDIUM = '\u{1F44D}\u{1F3FD}'; // thumbs up + skin tone
const HEART_VS16 = '\u2764\uFE0F';
const FLAGS_US_FR = '\u{1F1FA}\u{1F1F8}\u{1F1EB}\u{1F1F7}';
const E_ACUTE_NFC = '\u00E9';
const E_ACUTE_NFD = 'e\u0301';
const GAK_NFC = '\uAC01';
const GAK_JAMO = '\u1100\u1161\u11A8'; // L + V + T

function graphemes(text: string): string[] {
  const seg = new PretextSegmenter(undefined, { granularity: 'grapheme' });
  return [...seg.segment(text)].map((s) => s.segment);
}

function words(text: string): PretextSegmentData[] {
  const seg = new PretextSegmenter(undefined, { granularity: 'word' });
  return [...seg.segment(text)];
}

describe('PretextSegmenter constructor', () => {
  it('defaults to grapheme granularity like Intl.Segmenter', () => {
    expect(new PretextSegmenter().resolvedOptions().granularity).toBe('grapheme');
  });

  it('throws for sentence granularity', () => {
    expect(() => new PretextSegmenter('en', { granularity: 'sentence' })).toThrow(/sentence/);
  });
});

describe('grapheme granularity', () => {
  it('keeps simple cases apart', () => {
    expect(graphemes('ab')).toEqual(['a', 'b']);
    expect(graphemes('')).toEqual([]);
  });

  it('attaches combining marks to their base', () => {
    expect(graphemes(E_ACUTE_NFC)).toEqual([E_ACUTE_NFC]); // precomposed: one cp
    expect(graphemes(E_ACUTE_NFD)).toEqual([E_ACUTE_NFD]); // e + combining acute
    expect(graphemes(`${E_ACUTE_NFD}x`)).toEqual([E_ACUTE_NFD, 'x']);
  });

  it('keeps CRLF together and breaks around controls', () => {
    expect(graphemes('\r\n')).toEqual(['\r\n']);
    expect(graphemes('a\r\nb')).toEqual(['a', '\r\n', 'b']);
    expect(graphemes('a\nb')).toEqual(['a', '\n', 'b']);
  });

  it('composes Hangul both precomposed and from jamo', () => {
    expect(graphemes(GAK_NFC)).toEqual([GAK_NFC]);
    expect(graphemes(GAK_JAMO)).toEqual([GAK_JAMO]);
    // Two precomposed syllables stay two clusters (LVT then LV).
    expect(graphemes('\uAC01\uAC00')).toEqual(['\uAC01', '\uAC00']);
  });

  it('keeps emoji sequences whole', () => {
    expect(graphemes(THUMBS_MEDIUM)).toEqual([THUMBS_MEDIUM]);
    expect(graphemes(FAMILY)).toEqual([FAMILY]);
    expect(graphemes(HEART_VS16)).toEqual([HEART_VS16]);
  });

  it('pairs up regional indicators', () => {
    // US + FR flags: four RIs, two clusters.
    expect(graphemes(FLAGS_US_FR)).toEqual(['\u{1F1FA}\u{1F1F8}', '\u{1F1EB}\u{1F1F7}']);
  });

  it('matches the real Intl.Segmenter on the cases above (Node 24 has ICU)', () => {
    const real = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const text of [
      'ab',
      `${E_ACUTE_NFD}x`,
      'a\r\nb',
      GAK_NFC,
      GAK_JAMO,
      THUMBS_MEDIUM,
      FAMILY,
      FLAGS_US_FR,
      `x${HEART_VS16}y`,
    ]) {
      expect(graphemes(text), JSON.stringify(text)).toEqual([...real.segment(text)].map((s) => s.segment));
    }
  });
});

describe('word granularity', () => {
  it('segments the spec sentence with correct isWordLike and index', () => {
    const text = 'Hello, world! 3.5 don’t 你好';
    expect(words(text)).toEqual([
      { segment: 'Hello', index: 0, input: text, isWordLike: true },
      { segment: ',', index: 5, input: text, isWordLike: false },
      { segment: ' ', index: 6, input: text, isWordLike: false },
      { segment: 'world', index: 7, input: text, isWordLike: true },
      { segment: '!', index: 12, input: text, isWordLike: false },
      { segment: ' ', index: 13, input: text, isWordLike: false },
      { segment: '3.5', index: 14, input: text, isWordLike: true },
      { segment: ' ', index: 17, input: text, isWordLike: false },
      { segment: 'don’t', index: 18, input: text, isWordLike: true },
      { segment: ' ', index: 23, input: text, isWordLike: false },
      // ICU dictionary-segments 你好 as ONE word; we deliberately emit one
      // segment per CJK code point (documented behavior — pretext re-splits
      // CJK per character for line breaking anyway, so layout is identical).
      { segment: '你', index: 24, input: text, isWordLike: true },
      { segment: '好', index: 25, input: text, isWordLike: true },
    ]);
  });

  it('matches the real Intl.Segmenter on non-CJK text', () => {
    const real = new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const text of [
      'Hello, world! 3.5 don’t',
      "don't stop",
      '1,000.5 items',
      'foo_bar baz-qux',
      'a  b\nc',
    ]) {
      const ours = words(text).map((s) => ({ segment: s.segment, index: s.index, isWordLike: s.isWordLike }));
      const theirs = [...real.segment(text)].map((s) => ({
        segment: s.segment,
        index: s.index,
        isWordLike: s.isWordLike ?? false,
      }));
      expect(ours, JSON.stringify(text)).toEqual(theirs);
    }
  });

  it('keeps whitespace runs as single segments but isolates newlines', () => {
    expect(words('a  b\nc').map((s) => s.segment)).toEqual(['a', '  ', 'b', '\n', 'c']);
    expect(words(' \n ').map((s) => s.segment)).toEqual([' ', '\n', ' ']);
    expect(words('a\r\nb').map((s) => s.segment)).toEqual(['a', '\r\n', 'b']);
  });

  it('treats emoji as one non-word segment per cluster', () => {
    const segs = words(`hi ${FAMILY}!`);
    expect(segs.map((s) => s.segment)).toEqual(['hi', ' ', FAMILY, '!']);
    expect(segs.map((s) => s.isWordLike)).toEqual([true, false, false, false]);
  });

  it('splits kana and Hangul per code point, word-like', () => {
    // ひらがな
    expect(words('\u3072\u3089\u304C\u306A').map((s) => s.segment)).toEqual([
      '\u3072',
      '\u3089',
      '\u304C',
      '\u306A',
    ]);
    // 한국
    expect(words('\uD55C\uAD6D').map((s) => s.isWordLike)).toEqual([true, true]);
  });
});

describe('segments iterable shape', () => {
  it('is re-iterable and carries the input string, matching Intl', () => {
    const seg = new PretextSegmenter(undefined, { granularity: 'word' });
    const segments = seg.segment('a b');
    expect([...segments].length).toBe(3);
    expect([...segments].length).toBe(3); // second pass yields again
    expect([...segments][0]).toMatchObject({ segment: 'a', index: 0, input: 'a b' });
  });
});
