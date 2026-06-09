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

  it('contributes no height in a stack, while siblings still measure', () => {
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
    // Only the trigger (one line) + no gap contribution worth counting beyond the
    // single gap between the two children; the Portal adds 0 regardless of content.
    expect(h).toBe(LH + 4);
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
