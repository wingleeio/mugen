// Canvas `ctx.font` shorthand parser.
//
// pretext drives measurement exclusively through the canvas font shorthand
// (e.g. "italic 500 17px/24px Inter, 'Segoe UI', sans-serif"), so this is the
// only CSS we ever need to understand. We parse the small subset canvas
// actually accepts: optional style/variant/weight keywords, a px size with an
// optional (ignored) line-height, then a comma-separated family list.

export type FontStyle = 'normal' | 'italic' | 'oblique';

export type ParsedShorthand = {
  style: FontStyle;
  weight: number;
  sizePx: number;
  families: string[];
};

// The size token anchors the whole parse: everything before it is keywords,
// everything after it is the family list. Line-height ('/24px', '/1.5',
// '/normal') is layout-only — glyph advances don't depend on it — so we match
// and discard it.
const SIZE_RE = /(^|\s)(\d+(?:\.\d+)?)px(\s*\/\s*(?:\d+(?:\.\d+)?(?:px|em|%)?|normal))?(?=\s|$)/;

function parseWeightToken(token: string): number | null {
  // 'lighter'/'bolder' are relative to an inherited weight canvas doesn't
  // have; browsers resolve them against 'normal', giving 400 ('lighter'
  // clamps at lighter-than-normal buckets but for measurement purposes the
  // nearest registered face wins anyway) and 700.
  if (token === 'normal') return 400;
  if (token === 'bold') return 700;
  if (token === 'lighter') return 400;
  if (token === 'bolder') return 700;
  if (/^\d{1,4}$/.test(token)) {
    const n = parseInt(token, 10);
    if (n >= 1 && n <= 1000) return n;
  }
  return null;
}

function parseFamilyList(raw: string, font: string): string[] {
  // Hand-rolled scan instead of a naive split(',') so quoted family names
  // containing commas ("Foo, The Font") survive intact.
  const families: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      const name = current.trim();
      if (name.length > 0) families.push(name);
      current = '';
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last.length > 0) families.push(last);
  if (families.length === 0) {
    throw new Error(`pretext-native: font shorthand has no font family: "${font}".`);
  }
  return families;
}

const parseCache = new Map<string, ParsedShorthand>();

export function parseFontShorthand(font: string): ParsedShorthand {
  const cached = parseCache.get(font);
  if (cached !== undefined) return cached;

  const m = SIZE_RE.exec(font);
  if (m === null || m.index === undefined) {
    throw new Error(
      `pretext-native: could not find a px font size in font shorthand "${font}". ` +
        'Expected canvas shorthand like "16px Inter" or "italic 600 15px Inter, sans-serif".',
    );
  }
  const sizePx = parseFloat(m[2]!);
  const before = font.slice(0, m.index).trim();
  const after = font.slice(m.index + m[0].length).trim();

  let style: FontStyle = 'normal';
  let weight = 400;
  if (before.length > 0) {
    for (const token of before.split(/\s+/)) {
      const lower = token.toLowerCase();
      if (lower === 'normal') continue; // ambiguous style/variant/weight reset — all default anyway
      if (lower === 'italic' || lower === 'oblique') {
        style = lower;
        continue;
      }
      if (lower === 'small-caps') continue; // font-variant: no effect on advances we can model
      const w = parseWeightToken(lower);
      if (w !== null) {
        weight = w;
        continue;
      }
      throw new Error(`pretext-native: unrecognized token "${token}" in font shorthand "${font}".`);
    }
  }

  const parsed: ParsedShorthand = { style, weight, sizePx, families: parseFamilyList(after, font) };
  parseCache.set(font, parsed);
  return parsed;
}
