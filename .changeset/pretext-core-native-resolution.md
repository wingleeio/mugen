---
"@wingleeio/pretext-core": patch
---

Fix the native C++ JSI engine never actually engaging on React Native (it
silently fell back to the JS engine). Four issues, all in how the native module
is located and compiled:

- **`this`-binding**: `native.ts` called `createHybridObject` as a detached
  reference; Nitro's proxy throws "`this` is not bound". Call it as a method on
  `NitroModules`.
- **Premature memoization**: `getNative()` ran once at module load — before
  Nitro registers `PretextCore` — and cached the resulting `null` forever.
  Now it memoizes only success and retries until the registry is ready.
- **Metro can't bundle the shimmed require**: `platform: 'neutral'` rewrites
  `require` to a `__require` shim that Metro's dependency collector ignores, so
  `react-native-nitro-modules` was never bundled ("unknown module"). A
  post-build step restores the literal `require("react-native-nitro-modules")`.
- **C++ namespace collision**: the Nitro HybridObject impls live in
  `margelo::nitro::pretextcore` and referenced the global helper namespace as
  `pretextcore::…`, which the compiler bound to the enclosing namespace and
  failed to compile on a clean build. Renamed the helper namespace to `ptcjsi`.

With these, `getNative()` resolves the C++ HybridObject and text measurement
runs in native (verified on device: cold session opens dropped to ~100 ms).
