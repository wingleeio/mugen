---
"@wingleeio/pretext-core": patch
---

Fix web/electron builds that consume pretext-core (directly or via mugen). The
native locator does a literal `require("react-native-nitro-modules")` — the only
form Metro bundles — but web bundlers (Vite/Rolldown/webpack) eagerly resolve
that literal at build time and fail on React Native's Flow source ("Flow is not
supported"). The runtime try/catch only saved Node, not a web *build*.

pretext-core now ships two builds selected by `exports` conditions: the
`react-native` condition keeps the literal require (Metro/on-device), while the
default `import`/`require` entry uses a locator that always returns null and
references no native module at all — so web/electron/Node bundles stay clean and
fall back to the pure-JS engine, exactly as before native measurement existed.
