import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  markPrimitive,
  measureChildren,
  naturalWidthOf,
  toChildArray,
  type MeasureContext,
} from '@wingleeio/mugen';

/** Max-content width of `children` stacked as a column: the widest child. */
function naturalChildrenWidth(children: ReactNode, ctx: MeasureContext): number | null {
  let max = 0;
  for (const child of toChildArray(children)) {
    const w = naturalWidthOf(child, ctx);
    if (w == null) return null;
    max = Math.max(max, w);
  }
  return max;
}

/**
 * Shared open-state for one overlay. `anchor` is the trigger's DOM element,
 * captured from the event that opened it — so we never need a forwarded React
 * ref (works the same on React 18 and 19).
 */
export interface OverlayApi {
  open: boolean;
  anchor: HTMLElement | null;
  setOpen(open: boolean, anchor?: HTMLElement | null): void;
}

/** Create an isolated context so nested overlays (a tooltip inside a popover) don't collide. */
export function createOverlayContext(component: string) {
  const Ctx = createContext<OverlayApi | null>(null);

  function useOverlay(part: string): OverlayApi {
    const api = useContext(Ctx);
    if (!api) {
      throw new Error(`mugen-ui: <${component}.${part}> must be rendered inside <${component}>.`);
    }
    return api;
  }

  return { Ctx, useOverlay };
}

/**
 * The Root primitive. It uses hooks (open-state) and renders a context provider,
 * so it **must** be a primitive: the walker calls plain function components
 * during the measure pass (outside React), which would throw on the hooks. As a
 * primitive its render body is never walked; its `measure()` instead sums its
 * children — so the trigger contributes its real height and the content
 * contributes 0.
 */
export function createRoot(
  name: string,
  Ctx: ReturnType<typeof createOverlayContext>['Ctx'],
) {
  function Root(props: { children: ReactNode }): ReactElement {
    const api = useOverlayState();
    return <Ctx.Provider value={api}>{props.children}</Ctx.Provider>;
  }
  Root.displayName = name;
  return markPrimitive(Root as (props: { children: ReactNode }) => ReactElement, {
    name,
    measure: (props: Record<string, unknown>, ctx: MeasureContext) =>
      measureChildren((props as unknown as { children: ReactNode }).children, ctx),
    // The provider paints no box; in a row, the trigger is the only flex item
    // (the content is portaled), so the Root's content width is its widest child.
    naturalWidth: (props: Record<string, unknown>, ctx: MeasureContext) =>
      naturalChildrenWidth((props as unknown as { children: ReactNode }).children, ctx),
  });
}

/**
 * Mark an overlay's Content component as a primitive that measures as 0. Content
 * is portaled and reads context (hooks), so — like Root — it must be a primitive
 * to keep the walker from calling it; `measure: () => 0` means it adds no row
 * height and its children are never walked (so they may be arbitrary React).
 */
export function markZeroMeasure<T extends (props: never) => ReactElement | null>(
  component: T,
  name: string,
): T {
  (component as { displayName?: string }).displayName = name;
  // Portaled out of the row: no height, no width, no flex item.
  return markPrimitive(component, {
    name,
    measure: () => 0,
    naturalWidth: () => 0,
    outOfFlow: true,
  });
}

/** The state hook a Root provider uses to back its context. */
export function useOverlayState(initialOpen = false): OverlayApi {
  const [open, setOpenState] = useState(initialOpen);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const setOpen = useCallback<OverlayApi['setOpen']>((next, nextAnchor) => {
    setOpenState(next);
    if (nextAnchor !== undefined) setAnchor(nextAnchor);
  }, []);
  return useMemo(() => ({ open, anchor, setOpen }), [open, anchor, setOpen]);
}

export interface TriggerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type DomHandlers = Partial<Record<string, (e: never) => void>>;

/**
 * Build a trigger primitive. Its `measure()` walks the children exactly (they
 * occupy real row space), but its render is a plain wrapper — never walked — so
 * it can attach arbitrary handlers and a `cursor`. The wrapper is a flex column
 * with no chrome, so its painted height equals `measureChildren`.
 */
export function createTrigger(
  name: string,
  useOverlay: (part: string) => OverlayApi,
  bind: (api: OverlayApi) => DomHandlers,
) {
  function Trigger(props: TriggerProps): ReactElement {
    const api = useOverlay('Trigger');
    const handlers = bind(api);
    return (
      <div
        className={props.className}
        style={{
          // `inline-flex` + `fit-content` + `align-self: center` keep the trigger
          // sized to its measured content and stop it stretching as a flex item,
          // so a trigger in an HStack can never be pulled to the row height. All
          // overridable via `style`.
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          alignSelf: 'center',
          width: 'fit-content',
          cursor: 'pointer',
          ...props.style,
        }}
        {...handlers}
      >
        {props.children}
      </div>
    );
  }
  Trigger.displayName = name;
  return markPrimitive(Trigger as (props: TriggerProps) => ReactElement, {
    name,
    measure: (props: Record<string, unknown>, ctx: MeasureContext) =>
      measureChildren((props as unknown as TriggerProps).children, ctx),
    // The wrapper renders `width: fit-content` — its flex-item width is its
    // widest child, which is what content-based HStack distribution needs.
    naturalWidth: (props: Record<string, unknown>, ctx: MeasureContext) =>
      naturalChildrenWidth((props as unknown as TriggerProps).children, ctx),
  });
}
