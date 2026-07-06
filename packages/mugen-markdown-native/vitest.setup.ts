// react-test-renderer's act() needs this opt-in to flush effects synchronously
// (the fade tests depend on the FadeMarkdown scope arming in a useEffect).
(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

// React Native has requestAnimationFrame; plain Node doesn't. The animation
// clock's `canAnimate()` gates the fade path on it.
const g = globalThis as Record<string, unknown>;
if (typeof g['requestAnimationFrame'] === 'undefined') {
  g['requestAnimationFrame'] = (cb: (t: number) => void) =>
    setTimeout(() => cb(Date.now()), 16) as unknown as number;
  g['cancelAnimationFrame'] = (id: number) => clearTimeout(id);
}
