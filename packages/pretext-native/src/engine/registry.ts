// Font registry: the app registers the font binaries it ships (the same TTFs
// it hands to React Native's font loader), and measurement resolves canvas
// font shorthands against them. There is no system-font discovery on
// purpose — Hermes gives us no way to read platform font files, so anything
// measurable must be registered explicitly. That's also what keeps
// measurement deterministic across iOS/Android.

import { parseFont, type ParsedFont } from '../sfnt/parse.js';
import type { FontStyle } from './shorthand.js';

export type RegisterFontOptions = {
  family: string;
  /** CSS-style weight; keywords accepted for convenience. Default 400. */
  weight?: number | 'normal' | 'bold';
  style?: FontStyle;
  /** Raw TTF/OTF/TTC bytes. */
  data: ArrayBuffer | Uint8Array;
};

export type ParsedFontInfo = {
  family: string;
  weight: number;
  style: FontStyle;
  unitsPerEm: number;
};

export type Face = {
  family: string;
  weight: number;
  style: FontStyle;
  font: ParsedFont;
};

// family (lowercased) -> registered faces. Faces are small (closures over a
// DataView), so we keep every registered variant and pick at resolve time.
const registry = new Map<string, Face[]>();

// 'sans-serif' etc. -> concrete family. Unlike browsers we have no platform
// default to fall back to, so generics resolve to nothing until the app maps
// them — but shorthands ending in a generic are extremely common, so the
// mapping hook matters.
type GenericFamily = 'sans-serif' | 'serif' | 'monospace' | 'system-ui';
const GENERIC_FAMILIES: ReadonlySet<string> = new Set(['sans-serif', 'serif', 'monospace', 'system-ui']);
const genericMap = new Map<string, string>();

// Resolution results are cached per shorthand string in measure.ts; any
// registry mutation invalidates those caches via this subscription.
const invalidationListeners = new Set<() => void>();
export function onRegistryChange(listener: () => void): void {
  invalidationListeners.add(listener);
}
function notifyChange(): void {
  for (const listener of invalidationListeners) listener();
}

function normalizeWeight(weight: number | 'normal' | 'bold' | undefined): number {
  if (weight === undefined || weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  return weight;
}

export function registerFont(options: RegisterFontOptions): void {
  const family = options.family;
  const weight = normalizeWeight(options.weight);
  const style: FontStyle = options.style ?? 'normal';
  // Parse eagerly so registration is the single place a bad font file can
  // fail — measurement stays exception-free for registered fonts.
  const font = parseFont(options.data);

  const key = family.toLowerCase();
  let faces = registry.get(key);
  if (!faces) {
    faces = [];
    registry.set(key, faces);
  }
  // Re-registering the same (family, weight, style) replaces — hot-reload
  // friendly and matches FontFace set semantics.
  const existing = faces.findIndex((f) => f.weight === weight && f.style === style);
  const face: Face = { family, weight, style, font };
  if (existing >= 0) faces[existing] = face;
  else faces.push(face);
  notifyChange();
}

export function clearRegisteredFonts(): void {
  registry.clear();
  genericMap.clear();
  notifyChange();
}

export function getRegisteredFonts(): ParsedFontInfo[] {
  const out: ParsedFontInfo[] = [];
  for (const faces of registry.values()) {
    for (const f of faces) {
      out.push({ family: f.family, weight: f.weight, style: f.style, unitsPerEm: f.font.unitsPerEm });
    }
  }
  return out;
}

export function setGenericFontFamily(generic: GenericFamily, family: string): void {
  genericMap.set(generic, family);
  notifyChange();
}

/**
 * The concrete family a generic maps to (or null). Exposed so *paint*-side
 * code (e.g. mugen-native's `fontShorthandToTextStyle`) can resolve a
 * `sans-serif` shorthand to the same registered family the measurement used —
 * measurement and paint must pick the same face.
 */
export function resolveGenericFontFamily(name: string): string | null {
  return genericMap.get(name.toLowerCase()) ?? null;
}

/**
 * CSS-font-matching-lite weight selection: exact match wins; otherwise the
 * nearest weight by absolute distance, with ties broken toward the requested
 * direction (light requests prefer lighter faces, bold requests prefer
 * bolder ones). Full CSS has more ceremony around the 400/500 band; nearest
 * distance covers real-world font sets identically.
 */
function pickByWeight(faces: Face[], desired: number): Face {
  let best = faces[0]!;
  let bestDist = Math.abs(best.weight - desired);
  for (let i = 1; i < faces.length; i++) {
    const face = faces[i]!;
    const dist = Math.abs(face.weight - desired);
    if (dist < bestDist) {
      best = face;
      bestDist = dist;
    } else if (dist === bestDist && dist !== 0) {
      const preferLower = desired < 400;
      const candidateIsLower = face.weight < best.weight;
      if (preferLower === candidateIsLower) best = face;
    }
  }
  return best;
}

/**
 * Resolve one family name (after generic mapping) to a face, or null if the
 * family isn't registered. Italic/oblique fall back to each other, then to
 * normal — synthetic slanting doesn't change advance widths, so a normal face
 * measures identically to a faux-italic render.
 */
export function resolveFace(familyName: string, style: FontStyle, weight: number): Face | null {
  let name = familyName.toLowerCase();
  if (GENERIC_FAMILIES.has(name)) {
    const mapped = genericMap.get(name);
    if (mapped === undefined) return null;
    name = mapped.toLowerCase();
  }
  const faces = registry.get(name);
  if (!faces || faces.length === 0) return null;

  const stylePreference: FontStyle[] =
    style === 'normal' ? ['normal', 'oblique', 'italic'] : style === 'italic' ? ['italic', 'oblique', 'normal'] : ['oblique', 'italic', 'normal'];
  for (const s of stylePreference) {
    const candidates = faces.filter((f) => f.style === s);
    if (candidates.length > 0) return pickByWeight(candidates, weight);
  }
  return null; // unreachable — stylePreference covers all styles
}
