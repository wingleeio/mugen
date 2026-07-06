---
'@wingleeio/mugen': patch
'@wingleeio/mugen-markdown': patch
'@wingleeio/mugen-markdown-native': patch
'@wingleeio/mugen-native': patch
'@wingleeio/pretext-native': patch
---

Upgrade `@chenglou/pretext` to 0.0.8. Line breaking no longer splits slash-joined word tokens ("pipeline/features/packages", "and/or") where browsers offer no break opportunity — computed row heights previously undershot the paint by one line whenever such a token straddled a wrap point, overlapping rows in virtualized transcripts. Includes a browser regression test with the real-world failing paragraph across nine widths.
