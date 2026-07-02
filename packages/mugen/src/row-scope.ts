import { createContext } from 'react';
import type { SlotHost } from './session';

/**
 * The per-row handle `useMugenRow` resolves through when a component renders
 * nested under React (where no ambient session exists). One frozen object per
 * row, created once and never replaced — the context value NEVER changes
 * identity, so providing it costs nothing: React context only re-renders
 * consumers when the value changes, and this one can't. Re-renders reach
 * nested consumers the ordinary way (the whole row re-renders on any slot
 * change) plus each consumer's own row-version subscription, which survives
 * memo-stable ancestors bailing out.
 */
export interface RowScopeRef {
  readonly host: SlotHost;
  readonly rowKey: string;
}

export const RowScopeContext = createContext<RowScopeRef | null>(null);
