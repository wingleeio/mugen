// Web / Node locator — the DEFAULT build's native locator.
//
// The counterpart `native.ts` does a literal `require("react-native-nitro-modules")`
// so Metro can bundle the peer dep. That literal is correct for React Native,
// but WEB bundlers (Vite/Rolldown/webpack) eagerly RESOLVE a literal `require`
// at build time — even inside a try/catch — and then choke on React Native's
// Flow-typed source ("Flow is not supported"). A runtime try/catch only saves
// Node, not a web *build*.
//
// So this module — selected by the `import`/`browser`/`node` export conditions
// (everything except `react-native`) — never references any native module. It
// always reports "no native kernel", and callers fall back to the pure-JS
// @chenglou/pretext engine, identical to importing that package directly.
import type { PretextCore } from './specs/pretext-core.nitro.js';

export function getNative(): PretextCore | null {
  return null;
}
