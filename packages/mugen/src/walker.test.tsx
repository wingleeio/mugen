import { describe, expect, it, vi } from 'vitest';

const CHAR_W = 10;
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ __text: text })),
  layout: vi.fn((prepared: { __text: string }, width: number, lineHeight: number) => {
    const lineCount = Math.max(1, Math.ceil((prepared.__text.length * CHAR_W) / Math.max(1, width)));
    return { height: lineCount * lineHeight, lineCount };
  }),
  clearCache: vi.fn(),
}));

import { heightOf } from './walker';
import { Text } from './primitives/text';
import { VStack, HStack, definePrimitive } from './primitives/box';
import type { TextDefaults } from './text-defaults';

const LH = 20;
const defaults: TextDefaults = { font: '16px Inter', lineHeight: LH };

describe('walker: primitive measurement', () => {
  it('measures a single line of Text as one line height', () => {
    expect(heightOf(<Text>{'hi'}</Text>, 600, defaults)).toBe(LH);
  });

  it('wraps Text by width (length × CHAR_W / width lines)', () => {
    // 100 chars × 10px = 1000px of text at width 200 → 5 lines.
    expect(heightOf(<Text>{'x'.repeat(100)}</Text>, 200, defaults)).toBe(5 * LH);
  });

  it('VStack sums children plus gaps plus padding', () => {
    const h = heightOf(
      <VStack gap={4} padding={8}>
        <Text>{'a'}</Text>
        <Text>{'b'}</Text>
      </VStack>,
      600,
      defaults,
    );
    expect(h).toBe(LH + 4 + LH + 16); // two lines + one gap + 2×padding
  });

  it('HStack takes the tallest child plus padding', () => {
    const h = heightOf(
      <HStack gap={4} padding={8}>
        <Text>{'a'}</Text>
        <Text>{'b'}</Text>
      </HStack>,
      600,
      defaults,
    );
    expect(h).toBe(LH + 16); // max(line, line) + 2×padding
  });

  it('a declared height is authoritative (ignores children)', () => {
    const h = heightOf(
      <VStack height={120}>
        <Text>{'x'.repeat(500)}</Text>
      </VStack>,
      200,
      defaults,
    );
    expect(h).toBe(120);
  });

  it('definePrimitive(tag) measures like a box', () => {
    const Button = definePrimitive('button', { direction: 'horizontal' });
    const h = heightOf(
      <Button padding={6}>
        <Text>{'ok'}</Text>
      </Button>,
      600,
      defaults,
    );
    expect(h).toBe(LH + 12);
  });

  it('inherits font/lineHeight from list defaults when Text omits them', () => {
    // No font on the Text — falls back to `defaults`. (Throws if neither set.)
    expect(heightOf(<Text>{'hi'}</Text>, 600, { font: '16px Inter', lineHeight: 30 })).toBe(30);
  });

  it('invokes hook-free composed components', () => {
    const Row = ({ label }: { label: string }) => (
      <VStack gap={2}>
        <Text>{label}</Text>
        <Text>{label}</Text>
      </VStack>
    );
    expect(heightOf(<Row label="x" />, 600, defaults)).toBe(LH + 2 + LH);
  });
});

describe('walker: measurability guards', () => {
  it('throws on raw strings (must be wrapped in <Text>)', () => {
    expect(() => heightOf('bare' as unknown as React.ReactNode, 600, defaults)).toThrow(
      /raw text must be wrapped in <Text>/,
    );
  });

  it('throws on a raw host element', () => {
    expect(() => heightOf(<div>{'x'}</div>, 600, defaults)).toThrow(/not a measurable primitive/);
  });

  it('throws (with a font hint) when neither Text nor defaults set a font', () => {
    expect(() => heightOf(<Text>{'hi'}</Text>, 600, {})).toThrow(/needs a font/);
  });
});
