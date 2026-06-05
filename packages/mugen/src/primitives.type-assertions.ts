/**
 * Compile-only assertions for the primitive type restrictions. This file is
 * type-checked (via `tsc --noEmit`) but never executed; each `@ts-expect-error`
 * fails the build if the construct it guards stops being an error.
 */
import type { Font } from './font';
import type { MeasurableStyle, SafeClassName } from './style';

// ── Font template literal ────────────────────────────────────────────────────

const f1: Font = '16px Inter';
const f2: Font = '600 14px Inter';
const f3: Font = 'italic 500 17px Inter';
void f1, f2, f3;

// @ts-expect-error — no size+unit
const fBad1: Font = 'Inter';
// @ts-expect-error — number without a unit
const fBad2: Font = '16 Inter';
void fBad1, fBad2;

// ── MeasurableStyle omits spacing / sizing keys ──────────────────────────────

const okStyle: MeasurableStyle = { color: 'red', fontWeight: 600, background: 'white' };
void okStyle;

// @ts-expect-error — padding is owned by the `padding` prop
const badPad: MeasurableStyle = { padding: 8 };
// @ts-expect-error — margin would desync the box
const badMargin: MeasurableStyle = { marginTop: 4 };
// @ts-expect-error — gap is owned by the `gap` prop
const badGap: MeasurableStyle = { gap: 4 };
// @ts-expect-error — width is owned by the `width` prop
const badWidth: MeasurableStyle = { width: 100 };
// @ts-expect-error — height is owned by the `height` prop
const badHeight: MeasurableStyle = { height: 40 };
void badPad, badMargin, badGap, badWidth, badHeight;

// ── SafeClassName rejects spacing / sizing utilities ─────────────────────────

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Safe classes pass through unchanged.
const okClass1: AssertEqual<SafeClassName<'flex items-center'>, 'flex items-center'> = true;
const okClass2: AssertEqual<SafeClassName<'rounded-full border'>, 'rounded-full border'> = true;
void okClass1, okClass2;

// Spacing/sizing utilities resolve to the error literal (not the original).
const badClass1: AssertEqual<SafeClassName<'p-4'>, 'p-4'> = false;
const badClass2: AssertEqual<SafeClassName<'flex gap-2'>, 'flex gap-2'> = false;
const badClass3: AssertEqual<SafeClassName<'mt-6'>, 'mt-6'> = false;
const badClass4: AssertEqual<SafeClassName<'w-full'>, 'w-full'> = false;
const badClass5: AssertEqual<SafeClassName<'max-w-md'>, 'max-w-md'> = false;
void badClass1, badClass2, badClass3, badClass4, badClass5;
