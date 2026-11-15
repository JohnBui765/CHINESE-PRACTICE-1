Stroke-order data
=================

The JSON files in this folder (one per 256 Unicode code points, e.g. 4e.json = U+4E00-U+4EFF)
hold, for each of the 3,500 characters of level 1 of 通用规范汉字表 (data/common3500.txt), the
outline of every stroke as an SVG path ("s", in stroke order) and the centre line of every
stroke as points ("m"). stroke-chars.txt lists the characters that have data.

Source: the animCJK project by parsimonhi, https://github.com/parsimonhi/animCJK, file
graphicsZhHans.txt (simplified Chinese, mainland-China stroke order), commit
c63765b150cbd567c71d05cf4a4f8d00b57045c9. animCJK derives from Make Me a Hanzi
(https://github.com/skishore/makemeahanzi), whose stroke shapes were extracted from the
Arphic PL KaitiM GB and AR PL UKai fonts by Arphic Technology Co., Ltd.

Licence: the Arphic Public License (ARPHICPL.TXT in this folder, unchanged; the same licence as
the KaiTi font in fonts/). This is a MODIFIED VERSION of the animCJK data: changed on 2026-11-15
by tools/make-strokes.mjs of this project, which keeps only the 3,500 characters above, drops
every field except the strokes and medians, and splits the data into one JSON file per block of
code points. The modified data is freely available in this public repository, as the licence
asks. The original file can be re-downloaded by the same tool.
