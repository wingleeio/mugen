import { describe, expect, it, vi } from 'vitest';

const CHAR_W = 10;
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ __text: text })),
  prepareWithSegments: vi.fn((text: string) => ({ __text: text })),
  layout: vi.fn((prepared: { __text: string }, width: number, lineHeight: number) => {
    const lineCount = Math.max(1, Math.ceil((prepared.__text.length * CHAR_W) / Math.max(1, width)));
    return { height: lineCount * lineHeight, lineCount };
  }),
  measureNaturalWidth: vi.fn((prepared: { __text: string }) => prepared.__text.length * CHAR_W),
  clearCache: vi.fn(),
}));

import { heightOf, measureChildren } from './walker';
import { Text } from './primitives/text';
import { Portal } from './primitives/portal';
import { VStack, HStack, definePrimitive } from './primitives/box';
import { markPrimitive } from './primitives/core';
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

  it('treats a Fragment as transparent — sums its children in place', () => {
    // A standalone fragment sums like an array.
    const h = heightOf(
      <>
        <Text>{'a'}</Text>
        <Text>{'b'}</Text>
      </>,
      600,
      defaults,
    );
    expect(h).toBe(LH + LH);
  });

  it('splices Fragment children into a VStack, so gaps count the real children', () => {
    const h = heightOf(
      <VStack gap={4}>
        <Text>{'a'}</Text>
        <>
          <Text>{'b'}</Text>
          <Text>{'c'}</Text>
        </>
      </VStack>,
      600,
      defaults,
    );
    // Three lines, two gaps — the fragment is transparent, not one child.
    expect(h).toBe(LH + 4 + LH + 4 + LH);
  });

  it('splices Fragment children into an HStack (side-by-side, tallest wins)', () => {
    const h = heightOf(
      <HStack gap={4} padding={8}>
        <>
          <Text>{'a'}</Text>
          <Text>{'b'}</Text>
        </>
      </HStack>,
      600,
      defaults,
    );
    expect(h).toBe(LH + 16); // max(line, line) + 2×padding
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

  it('sizes HStack children to their content like flex, not an equal split', () => {
    // DOM flex items default to `flex: 0 1 auto` — content width. A short
    // marker beside a long label must leave the label its content width
    // (no wrap), not half the row.
    const h = heightOf(
      <HStack gap={10}>
        <Text>{'+'}</Text>
        <Text>{'x'.repeat(50)}</Text>
      </HStack>,
      600,
      defaults,
    );
    // marker 10px + label 500px + gap ≤ 600 → both single-line.
    expect(h).toBe(LH);
  });

  it('shrinks HStack children proportionally to their content on overflow', () => {
    // naturals: 200px and 600px in a 400px row (no gap) → scale 0.5 → 100/300.
    // The long text wraps to 2 lines at 300 (600/300); equal split (200 each)
    // would give 3 lines.
    const h = heightOf(
      <HStack>
        <Text>{'x'.repeat(20)}</Text>
        <Text>{'y'.repeat(60)}</Text>
      </HStack>,
      400,
      defaults,
    );
    expect(h).toBe(2 * LH);
  });

  it('falls back to an equal split when a child’s natural width is unknowable', () => {
    // A custom primitive with measure() but no naturalWidth() — the row can't
    // know its content width, so the remainder splits equally (the documented
    // fallback).
    const Opaque = markPrimitive(() => null, { name: 'Opaque', measure: () => 10 });
    const h = heightOf(
      <HStack>
        <Opaque />
        <Text>{'x'.repeat(40)}</Text>
      </HStack>,
      400,
      defaults,
    );
    // 400/2 = 200 each → 400px of text wraps to 2 lines.
    expect(h).toBe(2 * LH);
  });

  it('reads a fixed width through a composed component when distributing an HStack', () => {
    // In the DOM the component's root primitive IS the flex item, so its
    // `width` makes it `flex: 0 0 28px` and the sibling gets the rest. The
    // measure pass must see that width too — treating the icon as a grow child
    // would split the row in half and wrap the sibling's text where the DOM
    // doesn't (the tool-card gap bug).
    const Icon = () => <VStack width={28} height={28} />;
    const row = (
      <HStack gap={10}>
        <Icon />
        <Text>{'x'.repeat(30)}</Text>
      </HStack>
    );
    // Inner 350 − gap 10 − icon 28 = 312 for the text; 30 chars × 10px = 300px
    // → exactly 1 line. An equal split (170 each) would wrap it to 2.
    expect(heightOf(row, 350, defaults)).toBe(28); // max(icon 28, one 20px line)
  });
});

describe('walker: Portal (out-of-flow content)', () => {
  it('measures as 0', () => {
    expect(heightOf(<Portal>{<Text>{'tip'}</Text>}</Portal>, 600, defaults)).toBe(0);
  });

  it('contributes no height and no gap in a stack, while siblings still measure', () => {
    const h = heightOf(
      <VStack gap={4}>
        <Text>{'trigger'}</Text>
        <Portal>
          <Text>{'x'.repeat(500)}</Text>
        </Portal>
      </VStack>,
      200,
      defaults,
    );
    // The Portal paints no flex item, so it adds neither height nor a gap —
    // the stack is exactly the trigger's one line.
    expect(h).toBe(LH);
  });

  it('takes no width share in an HStack (siblings are sized as if it were absent)', () => {
    const h = heightOf(
      <HStack gap={10}>
        <Text>{'x'.repeat(58)}</Text>
        <Portal>
          <Text>{'overlay content'}</Text>
        </Portal>
      </HStack>,
      600,
      defaults,
    );
    // 58 chars × 10px = 580px ≤ 600 with no gap (the Portal is not a flex
    // item) → one line. Sharing width with the Portal would wrap it.
    expect(h).toBe(LH);
  });

  it('does not walk its children — non-primitive content inside is allowed', () => {
    // A raw host element / hook-using component would throw if walked. Inside a
    // Portal it never is, because Portal.measure returns 0 without recursing.
    const Popover = () => {
      throw new Error('Portal children must never be walked');
    };
    expect(() =>
      heightOf(
        <VStack>
          <Text>{'trigger'}</Text>
          <Portal>
            <div>
              <Popover />
            </div>
          </Portal>
        </VStack>,
        600,
        defaults,
      ),
    ).not.toThrow();
  });
});

describe('measureChildren helper', () => {
  it('sums children like a VStack, usable from a custom primitive', () => {
    // A bespoke primitive that renders however it likes but measures its children
    // the standard way — the shape mugen-ui's overlay triggers use.
    const Trigger = markPrimitive((props: { children: React.ReactNode }) => <>{props.children}</>, {
      name: 'Trigger',
      measure: (props, ctx) => measureChildren((props as { children: React.ReactNode }).children, ctx),
    });
    const h = heightOf(
      <Trigger>
        <Text>{'a'}</Text>
        <Text>{'b'}</Text>
      </Trigger>,
      600,
      defaults,
    );
    expect(h).toBe(LH + LH);
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
