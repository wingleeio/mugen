import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { heightOf } from '../walker';
import { HStack, VStack } from '../primitives/box';
import { Text } from '../primitives/text';
import type { TextDefaults } from '../text-defaults';

// Real pretext (no mock) against the real DOM. A named font is required; if it
// isn't installed both the canvas and the DOM fall back consistently, so the
// comparison still holds.
const FONT = '16px Arial';
const LINE_HEIGHT = 22;
const defaults: TextDefaults = { font: FONT, lineHeight: LINE_HEIGHT };

const corpus = [
  'short',
  'Hello world, this is a medium length sentence.',
  'The quick brown fox jumps over the lazy dog. '.repeat(6),
  'supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis',
  'AGI 春天到了。我们一起来看看吧，这是一段中文文本，用来测试换行。',
  'café résumé naïve Zürich Þingvellir Москва 日本語 العربية 🚀✨🎉',
];

/** True content height of `text` rendered with the same CSS as <Text>. */
function domHeight(text: string, width: number): number {
  const el = document.createElement('div');
  Object.assign(el.style, {
    font: FONT,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: 'normal',
    wordBreak: 'normal',
    overflowWrap: 'anywhere',
    margin: '0',
    padding: '0',
    width: `${width}px`,
    position: 'absolute',
    left: '-9999px',
    top: '0',
    visibility: 'hidden',
  });
  el.textContent = text;
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  document.body.removeChild(el);
  return h;
}

describe('pretext height ≈ DOM (Phase 3 accuracy gate)', () => {
  for (const text of corpus) {
    for (const width of [180, 280, 420]) {
      const label = `${JSON.stringify(text.slice(0, 24))}… @ ${width}px`;
      it(label, () => {
        const computed = heightOf(<Text>{text}</Text>, width, defaults);
        const actual = domHeight(text, width);
        // Same wrap → same line count → same N×lineHeight; allow sub-pixel slack.
        expect(Math.abs(computed - actual)).toBeLessThanOrEqual(1.5);
      });
    }
  }

  it('a composed chat row matches the DOM', () => {
    const body = 'The quick brown fox jumps over the lazy dog. '.repeat(3);
    const width = 360;
    const computed = heightOf(
      <VStack gap={4} padding={8}>
        <Text>{'Ada Lovelace'}</Text>
        <Text>{body}</Text>
      </VStack>,
      width,
      defaults,
    );
    const inner = width - 16;
    const actual = domHeight('Ada Lovelace', inner) + domHeight(body, inner) + 4 + 16;
    expect(Math.abs(computed - actual)).toBeLessThanOrEqual(2);
  });

  it('a fixed-width icon component beside text matches the DOM (width distribution)', () => {
    // The icon's width lives on the primitive its component returns; the walker
    // must distribute the row as the DOM does — icon fixed, text gets the rest.
    // Treating the icon as a grow child halves the text column and wraps a
    // title the DOM keeps on one line (the tool-card gap bug).
    const Icon = () => <VStack width={28} height={28} />;
    const card = (
      <HStack gap={11} padding={10} align="center">
        <Icon />
        <Text font="13px Arial" lineHeight={18}>
          {'Computed the centered scroll target'}
        </Text>
      </HStack>
    );
    const width = 316;
    const computed = heightOf(card, width, defaults);
    const { container } = render(<div style={{ width: `${width}px` }}>{card}</div>);
    const actual = (
      container.firstElementChild!.firstElementChild as HTMLElement
    ).getBoundingClientRect().height;
    cleanup();
    expect(Math.abs(computed - actual)).toBeLessThanOrEqual(1.5);
  });
});
