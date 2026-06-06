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

  it('clamps a fixed-width child to the row, wrapping its text at the clamped width', () => {
    // The child declares width 600 but the row is only 300 wide. It must be
    // measured at 300 (clamped) — the painted child shrinks to the row via
    // `max-width: 100%`, so measuring at 600 would under-count its wrapped lines
    // and leave the row too short (the mobile chat-bubble overflow bug).
    const bubble = (count: number) => (
      <HStack>
        <VStack width={600}>
          <Text>{'x'.repeat(count)}</Text>
        </VStack>
      </HStack>
    );
    // 60 chars × 10px = 600px of text: 2 lines at the clamped width 300, but
    // only 1 line at the un-clamped 600 — so this asserts the clamp happened.
    expect(heightOf(bubble(60), 300, defaults)).toBe(2 * LH);
    // A row wide enough for the declared width leaves it un-clamped: 1 line.
    expect(heightOf(bubble(60), 600, defaults)).toBe(LH);
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
