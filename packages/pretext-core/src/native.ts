// Locate the PretextCore Nitro HybridObject.
//
// On a React Native build with the native module installed, this returns the
// JSI-backed HybridObject. Everywhere else — web, Node, the vitest host, or an
// RN app that hasn't installed the native pod/gradle module — it returns null
// and callers fall back to the pure-JS @chenglou/pretext engine.
//
// `react-native-nitro-modules` ships React-Native-flavored source that a bare
// Node/vitest parse can't load (and importing it statically would crash the
// whole module on the host), so the lookup is a guarded, lazy `require`: no
// static import means the fallback path never touches native code.
import type { PretextCore } from './specs/pretext-core.nitro.js';

let cached: PretextCore | null | undefined;

function load(): PretextCore | null {
  try {
    // `require` exists in Metro's CJS runtime and in Node; it's simply absent
    // (typeof 'undefined') under ESM hosts, where we want the JS fallback.
    if (typeof require !== 'function') return null;
    const mod = require('react-native-nitro-modules') as {
      NitroModules?: { createHybridObject?<T>(name: string): T };
    };
    const create = mod?.NitroModules?.createHybridObject;
    if (typeof create !== 'function') return null;
    return create<PretextCore>('PretextCore');
  } catch {
    // Native module not installed, or the RN runtime isn't present. Fall back.
    return null;
  }
}

/** The PretextCore HybridObject, or null when native isn't available (memoized). */
export function getNative(): PretextCore | null {
  if (cached === undefined) cached = load();
  return cached;
}
