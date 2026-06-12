/**
 * Token vocabulary for the built-in code-block highlighter. The set is small on
 * purpose: highlighting is purely cosmetic paint layered over already-laid-out
 * text, so a coarse classification that is cheap to compute incrementally beats
 * a grammar-exact one that would need a real parser.
 */
export type TokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'constant'
  | 'function'
  | 'type'
  | 'property'
  | 'operator'
  | 'punctuation';

/**
 * One colour per token type. A value of `'currentColor'` paints that token in
 * the block's own text colour (whatever `color` computes to on the `<code>`),
 * which is how a token type opts out of special colouring.
 */
export type CodeTokenColors = Record<TokenType, string>;

/**
 * Default palette: mid-tone colours chosen to stay legible on both light and
 * dark page backgrounds, since the default theme inherits the page colours.
 */
export const defaultTokenColors: CodeTokenColors = {
  keyword: '#a855f7',
  string: '#059669',
  comment: '#8a919e',
  number: '#d97706',
  constant: '#ea580c',
  function: '#3b82f6',
  type: '#0d9488',
  property: '#db2777',
  operator: '#64748b',
  punctuation: 'currentColor',
};
