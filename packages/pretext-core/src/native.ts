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

let cached: PretextCore | null = null;

function load(): PretextCore | null {
  try {
    // `require` exists in Metro's CJS runtime and in Node; it's simply absent
    // (typeof 'undefined') under ESM hosts, where we want the JS fallback.
    //
    // The require string is a PLAIN LITERAL on purpose: Metro's dependency
    // collector only bundles modules referenced by a literal `require("…")`
    // (or a static import). A shimmed/aliased require (e.g. tsdown's
    // `__require`) is invisible to it and throws "unknown module" at runtime,
    // so the build below keeps this as a literal require.
    if (typeof require !== 'function') return null;
    const mod = require('react-native-nitro-modules') as {
      NitroModules?: { createHybridObject?<T>(name: string): T };
    } | null;
    const nitro = mod?.NitroModules;
    if (typeof nitro?.createHybridObject !== 'function') return null;
    // Call as a METHOD (nitro.createHybridObject), never as a detached
    // reference: Nitro's HybridNitroModulesProxy throws "`this` is not bound"
    // if createHybridObject is invoked standalone.
    return nitro.createHybridObject<PretextCore>('PretextCore');
  } catch {
    // Native module not installed, the RN runtime isn't present, or the JSI
    // registry isn't ready yet on this call. Fall back / retry.
    return null;
  }
}

/**
 * The PretextCore HybridObject, or null when native isn't available.
 *
 * Memoizes only SUCCESS: the very first call happens at module load, before
 * Nitro has registered `PretextCore` in its HybridObjectRegistry, so it returns
 * null. Memoizing that null permanently would strand every later call on the JS
 * fallback; instead we retry `load()` until it resolves (once, by which point
 * the registry is ready), then cache the instance.
 */
export function getNative(): PretextCore | null {
  if (cached !== null) return cached;
  const n = load();
  if (n !== null) cached = n;
  return n;
}
