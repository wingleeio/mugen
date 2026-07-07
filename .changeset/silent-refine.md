---
"@wingleeio/mugen": patch
---

`refineKeys(keys, { notify: false })` + `flushNotifications()` — resolve estimated heights WITHOUT waking subscribers, for callers inside a React render (the render-phase allocate). Waking mid-render was a setState-in-render violation ("Cannot update a component while rendering a different component") that, on RN, triggered a LogBox error every open/scroll through unrefined rows — its own severe lag. The list flushes the suppressed notifications post-commit.
