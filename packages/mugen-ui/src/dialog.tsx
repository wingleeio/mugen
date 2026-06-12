import type React from 'react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Portal } from '@wingleeio/mugen';
import { createOverlayContext, createRoot, createTrigger, markZeroMeasure } from './internal/overlay';

const { Ctx, useOverlay } = createOverlayContext('Dialog');

export interface DialogProps {
  children: ReactNode;
}

/** Root of a modal dialog. */
const Dialog = createRoot('Dialog', Ctx);

/** Click opens the dialog; measured normally (real row space). */
const Trigger = createTrigger('Dialog.Trigger', useOverlay, (api) => ({
  onClick: (e: React.MouseEvent<HTMLElement>) => api.setOpen(true, e.currentTarget),
}));

export interface DialogContentProps {
  /** Backdrop color. */
  backdrop?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The modal surface — portaled and measured as 0, so it never affects row
 * height. Renders a full-viewport backdrop with a centered panel; Escape,
 * backdrop press, and a press outside the panel all close it. Focus moves to the
 * panel on open and is restored to the trigger on close.
 */
const Content = markZeroMeasure(function Content(props: DialogContentProps) {
  const api = useOverlay('Content');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api.open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api.setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [api.open, api]);

  if (!api.open) return null;
  return (
    <Portal>
      <div
        // Backdrop. A press that lands here (outside the panel) closes the dialog.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) api.setOpen(false);
        }}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: props.backdrop ?? 'rgba(0,0,0,0.5)',
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={props.className}
          style={{ outline: 'none', ...props.style }}
        >
          {props.children}
        </div>
      </div>
    </Portal>
  );
}, 'Dialog.Content');

export interface DialogCloseProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** A button that closes the dialog — for a footer "Cancel" / a header "×". */
function Close(props: DialogCloseProps) {
  const api = useOverlay('Close');
  return (
    <button
      type="button"
      onClick={() => api.setOpen(false)}
      className={props.className}
      style={{ cursor: 'pointer', ...props.style }}
    >
      {props.children}
    </button>
  );
}
Close.displayName = 'Dialog.Close';

/** @deprecated Use a shadcn/Radix Dialog inside mugen's `Escape` primitive. */
const DialogNamespace = Object.assign(Dialog, { Trigger, Content, Close });
export { DialogNamespace as Dialog };
