Fonts used by Hanzi Drill
=========================

Both files are copied unchanged from Hanzi Grid (the repository CHINESE-HANDWRITING-PRACTICE-1),
where they were made, so the characters look exactly the same in both apps.

ukai-cn.ttf
  A MODIFIED VERSION of "AR PL UKai CN" (face 0 of ukai.ttc), Copyright 1999 Arphic
  Technology Co., Ltd., licensed under the Arphic Public License (LICENSE-ukai.txt, unchanged).
  Changed on 2026-10-29 with fontTools (tools/make_fonts.py of Hanzi Grid): reduced to the
  characters of 通用规范汉字表 (2013) that the font contains, and Chinese punctuation
  (。，、！？：；“”‘’《》…—); hinting removed.
  The same notice is written into the font's "Description" name record.
  The original font is kept unchanged in Hanzi Grid's fonts/source/ukai.ttc.

noto-sans-sc.ttf
  A MODIFIED VERSION of "Noto Sans SC" (NotoSansSC[wght].ttf from github.com/google/fonts,
  ofl/notosanssc), Copyright 2014-2021 Adobe, licensed under the SIL Open Font License 1.1
  (OFL-notosanssc.txt). Changed on 2026-10-29 with fontTools: the Regular (400) weight was
  taken from the variable font, then reduced to the characters of 通用规范汉字表 plus Latin
  letters, pinyin tone letters, punctuation and the arrow →; hinting removed.
  The name does not use the Reserved Font Name "Source".

Both modified fonts are freely available in this public repository, as the licences ask.
