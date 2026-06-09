import { useEffect, type RefObject } from 'react';

/**
 * Close an open overlay on Escape or on a pointer press outside both the anchor
 * and the content. Listeners are attached only while `open`. Outside-press uses
 * capture-phase `pointerdown` so it fires before the press lands on whatever is
 * underneath.
 */
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  refs: { anchor: HTMLElement | null; content: RefObject<HTMLElement | null> },
): void {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inAnchor = refs.anchor?.contains(target) ?? false;
      const inContent = refs.content.current?.contains(target) ?? false;
      if (!inAnchor && !inContent) onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, onDismiss, refs.anchor, refs.content]);
}
