import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Markdown, defineMarkdownComponents, VStack } from './index';

afterEach(cleanup);

function html(source: string, props: Partial<Parameters<typeof Markdown>[0]> = {}) {
  const { container } = render(createElement(Markdown, { source, ...props }));
  return container;
}

describe('Markdown render → DOM', () => {
  it('renders headings and paragraph text', () => {
    const c = html('# Title\n\nSome body text.');
    expect(c.textContent).toContain('Title');
    expect(c.textContent).toContain('Some body text.');
  });

  it('renders inline marks: bold span, inline code, link', () => {
    const c = html('hello **bold** and `code` and [site](https://example.com)');
    const codes = [...c.querySelectorAll('code')].map((n) => n.textContent);
    expect(codes).toContain('code');
    const link = c.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.textContent).toBe('site');
    // The bold run is a span whose font weight is the strong weight.
    const bold = [...c.querySelectorAll('span')].find((s) => s.textContent === 'bold');
    expect(bold).toBeTruthy();
    expect(bold!.getAttribute('style') ?? '').toContain('700');
  });

  it('renders a fenced code block in a <pre> with the raw value', () => {
    const c = html('```ts\nconst x = 1\nconst y = 2\n```');
    const pre = c.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain('const x = 1');
    expect(pre!.textContent).toContain('const y = 2');
    // Code must not wrap (height comes from line count).
    expect(pre!.querySelector('code')?.getAttribute('style') ?? '').toContain('pre');
  });

  it('renders a blockquote element', () => {
    const c = html('> quoted text');
    const bq = c.querySelector('blockquote');
    expect(bq).toBeTruthy();
    expect(bq!.textContent).toContain('quoted text');
  });

  it('renders unordered bullets and ordered numbers', () => {
    const ul = html('- one\n- two');
    expect(ul.textContent).toContain('•');
    expect(ul.textContent).toContain('one');

    const ol = html('1. first\n2. second');
    expect(ol.textContent).toContain('1.');
    expect(ol.textContent).toContain('2.');
  });

  it('renders task list checkboxes', () => {
    const c = html('- [x] done\n- [ ] todo');
    expect(c.textContent).toContain('☑'); // ☑
    expect(c.textContent).toContain('☐'); // ☐
  });

  it('renders GFM table cells', () => {
    const c = html('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(c.textContent).toContain('a');
    expect(c.textContent).toContain('b');
    expect(c.textContent).toContain('1');
    expect(c.textContent).toContain('2');
  });

  it('honours a typed component override', () => {
    const components = defineMarkdownComponents({
      heading: ({ children }) =>
        createElement(VStack, { ['data-testid' as string]: 'custom-h' }, children),
    });
    const c = html('# Overridden', { components });
    const custom = c.querySelector('[data-testid="custom-h"]');
    expect(custom).toBeTruthy();
    expect(custom!.textContent).toContain('Overridden');
  });

  it('applies theme font family to rendered runs', () => {
    const c = html('plain text', { theme: { fontFamily: 'Inter' } });
    const span = [...c.querySelectorAll('span')].find((s) => s.textContent === 'plain text');
    expect(span?.getAttribute('style') ?? '').toContain('Inter');
  });
});
