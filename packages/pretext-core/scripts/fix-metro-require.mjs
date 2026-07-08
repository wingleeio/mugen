// Post-build: rewrite tsdown's `__require("react-native-nitro-modules")` shim
// back to a LITERAL `require("react-native-nitro-modules")` in the emitted
// bundle.
//
// Why: this package builds with tsdown `platform: 'neutral'` so the lazy
// native-module lookup in src/native.ts does not pull a `createRequire` from
// `node:module` (which React Native / Metro cannot bundle). But `platform:
// 'neutral'` also rewrites every `require(...)` to a `__require(...)` shim, and
// Metro's build-time dependency collector only bundles modules referenced by a
// LITERAL `require("…")`. A shimmed `__require("react-native-nitro-modules")`
// is invisible to Metro → "unknown module" at runtime → the C++ JSI engine
// never loads and measurement silently falls back to JS. Restoring the literal
// require lets Metro collect + bundle the peer dep; on Node/web the require is
// still wrapped in try/catch and falls back cleanly.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist');
const NEEDLE = /__require\((\s*["']react-native-nitro-modules["']\s*)\)/g;

let patched = 0;
for (const file of readdirSync(distDir)) {
  if (!/\.(js|cjs|mjs)$/.test(file)) continue;
  const path = join(distDir, file);
  const src = readFileSync(path, 'utf8');
  if (!NEEDLE.test(src)) continue;
  writeFileSync(path, src.replace(NEEDLE, 'require($1)'));
  patched++;
  console.log(`[fix-metro-require] rewrote __require → require in dist/${file}`);
}
if (patched === 0) {
  console.log('[fix-metro-require] no __require("react-native-nitro-modules") found (nothing to do)');
}
