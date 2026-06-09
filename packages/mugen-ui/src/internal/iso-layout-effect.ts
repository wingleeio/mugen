import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server — avoids React's
 * SSR warning. Overlay content only paints on the client (its `Portal` renders
 * `null` server-side), but the hook still has to be called unconditionally.
 */
export const useIsoLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
