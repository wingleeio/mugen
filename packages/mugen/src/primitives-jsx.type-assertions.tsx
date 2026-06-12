/**
 * Compile-only JSX assertions: the primitive components must reject spacing /
 * sizing utilities at the call site (where the lint rule used to fire). Checked
 * by `tsc --noEmit`, never executed.
 */
import { VStack, HStack, Text, Escape, definePrimitive } from './index';

const Button = definePrimitive('button');

// ── Allowed ──
export const ok1 = <VStack gap={4} padding={8} width={120} height={40} />;
export const ok2 = <VStack className="flex items-center rounded-full" />;
export const ok3 = <VStack style={{ color: 'red', background: 'white' }} />;
export const ok4 = (
  <HStack gap={8}>
    <Text font="16px Inter" lineHeight={22}>
      {'hello'}
    </Text>
  </HStack>
);
export const ok5 = <Button onClick={() => {}} padding={6} />;

// ── Rejected: spacing/sizing utility classes ──
// @ts-expect-error — `p-4` breaks measurability
export const bad1 = <VStack className="p-4" />;
// @ts-expect-error — `gap-2` is owned by the `gap` prop
export const bad2 = <HStack className="flex gap-2" />;
// @ts-expect-error — `mt-6` margin would desync the box
export const bad3 = <VStack className="mt-6" />;
// @ts-expect-error — `w-full` sizing
export const bad4 = <Text className="w-full">{'x'}</Text>;
// @ts-expect-error — `max-w-md` sizing
export const bad5 = <Button className="max-w-md" />;

// ── Rejected: spacing/sizing inline styles ──
// @ts-expect-error — padding is a prop, not a style
export const bad6 = <VStack style={{ padding: 4 }} />;
// @ts-expect-error — width is a prop, not a style
export const bad7 = <HStack style={{ width: 100 }} />;

// ── Escape: declared box, unconstrained interior ──
// Inside an Escape the walker never looks, so className/style/children are
// deliberately unrestricted — only the frame's `height` is required.
export const ok6 = (
  <Escape height={32} className="flex items-center px-2" style={{ paddingTop: 4 }}>
    <div>{'arbitrary DOM, never measured'}</div>
  </Escape>
);
// @ts-expect-error — the declared height is the whole contract; it is required
export const bad8 = <Escape>{<div />}</Escape>;
