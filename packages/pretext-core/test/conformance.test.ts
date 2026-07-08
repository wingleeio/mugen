// Golden conformance: the C++ kernel must be byte-identical (Object.is per
// number, === per string) to the TS engine (@chenglou/pretext on
// pretext-native's polyfills — exactly what runs on Hermes today).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  Reference,
  Runner,
  compareOp,
  ensurePolyfills,
  fontOps,
  pkgRoot,
  type Op,
} from './driver.js';

const WIDTHS = [180, 320.5, 375, 800];
const LINE_HEIGHT = 24;
const BODY = '400 16px Geist';
const MONO = '400 13.5px "Geist Mono"';

let runner: Runner;
let reference: Reference;
let nextId = 1;

beforeAll(async () => {
  ensurePolyfills();
  runner = new Runner();
  reference = new Reference();
  for (const op of fontOps) {
    await runner.run(op);
    reference.run(op);
  }
});

afterAll(() => {
  runner?.close();
});

async function expectMatch(ops: Op[]): Promise<void> {
  const mismatches: string[] = [];
  for (const op of ops) {
    mismatches.push(...(await compareOp(runner, reference, op)));
    if (mismatches.length > 24) break;
  }
  expect(mismatches).toEqual([]);
}

function fullSuiteFor(text: string, font: string, options: Partial<Op> = {}): Op[] {
  const id = nextId++;
  const ops: Op[] = [
    { op: 'prepare', id, text, font, withSegments: true, ...options },
    { op: 'preparedDump', id },
    { op: 'naturalWidth', id },
  ];
  for (const maxWidth of WIDTHS) {
    ops.push({ op: 'layout', id, maxWidth, lineHeight: LINE_HEIGHT });
    ops.push({ op: 'layoutWithLines', id, maxWidth, lineHeight: LINE_HEIGHT });
    ops.push({ op: 'measureLineStats', id, maxWidth });
  }
  return ops;
}

describe('primitive cases', () => {
  it('measureTextWidth basics', async () => {
    const texts = [
      'hello world',
      'AV Wa To kerning',
      'a', ' ', '', '—', 'ﬁ ligature candidates ffi',
      'emoji 😀 and 🇺🇸 flags 👍🏽',
      'tabs\tand\nnewlines\r\n',
      '中文排版规则测试，句读。',
      'مرحبا بالعالم',
      '1,000.50 numbers-and-hyphens',
    ];
    await expectMatch(
      texts.flatMap(text => [
        { op: 'measureTextWidth', text, font: BODY },
        { op: 'measureTextWidth', text, font: MONO },
      ]),
    );
  });

  it('prepare/layout core shapes', async () => {
    const cases: Array<[string, Partial<Op>?]> = [
      ['hello world, a simple wrapping paragraph that should span lines.'],
      ['   leading and trailing spaces   '],
      ['word'],
      [''],
      ['multiple   internal    spaces collapse'],
      ['hard\nbreaks\npreserved?', { whiteSpace: 'pre-wrap' }],
      ['pre-wrap  keeps   spaces', { whiteSpace: 'pre-wrap' }],
      ['tabs\tin\tpre-wrap', { whiteSpace: 'pre-wrap' }],
      ['supercalifragilisticexpialidociousandthensomelongunbreakabletoken'],
      ['https://example.com/a/very/long/url-with-hyphens-and?query=params&x=1'],
      ['soft­hyphen­opportunities in a sentence'],
      ['zero​width​breaks here'],
      ['better. punctuation, merging; rules!'],
      ['日本語の折り返し規則、句読点のぶら下げを含む長い文章です。'],
      ['中文「引号」和（括号）以及标点。挤压规则测试。'],
      ['한국어 줄바꿈 규칙 keep-all 테스트', { wordBreak: 'keep-all' }],
      ['中文 keep-all 测试，标点。', { wordBreak: 'keep-all' }],
      ['mixed 中文 and English 混排 text'],
      ['letter spacing case', { letterSpacing: 1.5 }],
      ['spaced­soft­hyphen', { letterSpacing: 0.5 }],
      ['emoji 😀😀😀 wrapping 👨‍👩‍👧‍👦 families and 🇺🇸 flags'],
      ['dash-separated-compound-words-that-prefer-breaking-at-hyphens'],
      ['1234567890123456789012345678901234567890 digits run'],
      ['العربية مع الفواصل، والنقاط. نص طويل يلتف على أسطر متعددة'],
      ['עברית עם פיסוק, ונקודות. טקסט ארוך'],
      ['ไทยไม่มีช่องว่างระหว่างคำทดสอบการตัดบรรทัด'],
    ];
    for (const [text, options] of cases) {
      await expectMatch(fullSuiteFor(text, BODY, options));
    }
  });

  it('mono + other fonts', async () => {
    await expectMatch(fullSuiteFor('const x = () => `${a}` + 0x1f; // comment', MONO));
    await expectMatch(fullSuiteFor('Bold heading wraps differently', '700 21px Geist'));
    await expectMatch(fullSuiteFor('generic family fallback', '16px sans-serif'));
  });
});

describe('rich inline', () => {
  it('mixed-run layout', async () => {
    const id = nextId++;
    const items = [
      { text: 'The quick ', font: BODY },
      { text: 'brown', font: '700 16px Geist' },
      { text: ' fox jumps over ', font: BODY },
      { text: 'inline_code(x)', font: MONO, letterSpacing: 0 },
      { text: ' and a ', font: BODY },
      { text: 'link chip', font: BODY, break: 'never', extraWidth: 14 },
      { text: ' then keeps going with a longer tail to force wrapping.', font: BODY },
    ];
    const ops: Op[] = [{ op: 'prepareRich', id, items }];
    for (const maxWidth of WIDTHS) {
      ops.push({ op: 'walkRich', id, maxWidth, materialize: true });
      ops.push({ op: 'richStats', id, maxWidth });
    }
    await expectMatch(ops);
  });

  it('rich edge cases', async () => {
    const id = nextId++;
    const items = [
      { text: '  leading spaces', font: BODY },
      { text: 'trailing spaces  ', font: BODY },
      { text: '', font: BODY },
      { text: '中文混排', font: BODY },
      { text: ' spaced 😀 emoji ', font: '500 16px Geist', letterSpacing: 0.25 },
    ];
    const ops: Op[] = [{ op: 'prepareRich', id, items }];
    for (const maxWidth of [120, 260, 500]) {
      ops.push({ op: 'walkRich', id, maxWidth, materialize: true });
    }
    await expectMatch(ops);
  });
});

describe('corpus', () => {
  const corpusDir = join(pkgRoot, 'test/corpus');
  const files = readdirSync(corpusDir).filter(f => f.endsWith('.txt'));
  const MAX_PARAGRAPHS = 120;

  for (const file of files) {
    it(file, async () => {
      const raw = readFileSync(join(corpusDir, file), 'utf8');
      const paragraphs = raw
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
      const step = Math.max(1, Math.floor(paragraphs.length / MAX_PARAGRAPHS));
      const sample = paragraphs.filter((_, i) => i % step === 0).slice(0, MAX_PARAGRAPHS);

      const mismatches: string[] = [];
      for (const text of sample) {
        const id = nextId++;
        const ops: Op[] = [
          { op: 'prepare', id, text, font: BODY, withSegments: true },
          { op: 'preparedDump', id },
        ];
        for (const maxWidth of [320.5, 800]) {
          ops.push({ op: 'layoutWithLines', id, maxWidth, lineHeight: LINE_HEIGHT });
        }
        for (const op of ops) {
          mismatches.push(...(await compareOp(runner, reference, op)));
          if (mismatches.length > 12) break;
        }
        if (mismatches.length > 12) break;
      }
      expect(mismatches).toEqual([]);
    });
  }
});

// Real comet transcripts (private; local-only). Point COMET_CORPUS_DIR at a
// directory of .txt/.md files extracted from real sessions to include them.
describe.skipIf(!process.env.COMET_CORPUS_DIR)('comet transcripts', () => {
  it('matches on real transcripts', async () => {
    const dir = process.env.COMET_CORPUS_DIR!;
    const files = readdirSync(dir).filter(f => /\.(txt|md)$/.test(f));
    const mismatches: string[] = [];
    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf8');
      const paragraphs = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      for (const text of paragraphs) {
        const id = nextId++;
        for (const op of [
          { op: 'prepare', id, text, font: BODY, withSegments: true } as Op,
          { op: 'layoutWithLines', id, maxWidth: 361, lineHeight: 26 } as Op,
          { op: 'naturalWidth', id } as Op,
        ]) {
          mismatches.push(...(await compareOp(runner, reference, op)));
          if (mismatches.length > 12) break;
        }
        if (mismatches.length > 12) break;
      }
    }
    expect(mismatches).toEqual([]);
  });
});
