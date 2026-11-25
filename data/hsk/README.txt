HSK dictionary
==============

hsk1.txt, hsk2.txt and hsk3.txt are the built-in dictionary of Hanzi Drill: the 978 words of
levels 1-3 of the HSK syllabus that CLEC published in November 2025 (the "new HSK" the exams
switch to during 2026): 294 words in HSK 1, 197 more in HSK 2, 487 more in HSK 3. Ten words
that a learner needs with two readings by HSK 3 have one entry per reading (还 hái / huán,
了 le / liǎo, 只 zhǐ / zhī, 地 de / dì, 得 de / děi, 过 guò / guo, 长 cháng / zhǎng,
着 zhe / zháo, 干 gàn / gān, 种 zhǒng / zhòng). That makes 988 entries, each with its dictionary
pinyin, a short meaning and three example sentences (2,964 sentences).

Format: the lesson format of Hanzi Grid, with three example sentences under each word:
  爱 | ài | to love; to like
  = 妈妈，我爱你！ | Māma, wǒ ài nǐ! | Mom, I love you!
The pinyin of a sentence is written as it is said, with the tone changes of prompts/examples.txt.
A line ending in " ?" would mean the AI was not sure of it; no line is flagged. The app reads
these files with js/core/hsk.js. Hanzi Grid and this app's New list can open them too, but they
keep only the first sentence of each word, and only one reading of a word written twice.

Where it comes from
- The words and their levels: complete-hsk-vocabulary by Yanis Zafirópulos,
  https://github.com/drkameleon/complete-hsk-vocabulary, file complete.min.json (main branch,
  downloaded on 2026-11-25, SHA-256
  52d8e64ba65a6db4a38ea34302c6de5df53cdb5145254b25edcbf93b80676434), MIT License
  (LICENSE-complete-hsk-vocabulary.txt). Its README does not explain its level marks t1-t7;
  their word counts match the 2025 syllabus (300, 500 and 1,000 words by HSK 1, 2 and 3; the
  file has 294, 491 and 978), so they were taken as that syllabus. Only the words and their
  levels were used.
- The readings, meanings and example sentences were written for this app on 2026-11-25 by
  Claude (an AI by Anthropic), following prompts/examples.txt and prompts/pinyin-meaning.txt with
  three sentences per word, using only words of the word's own level or lower. A script checked
  every line: one pinyin syllable per character, the tone of each syllable against the
  dictionary readings of its character and the prompts' tone changes, at most 12 boxes, only the
  3,500 common characters, no sentence twice. It cannot tell whether a sentence sounds natural,
  and no person has checked the sentences yet, so mistakes are possible.
- No text from CC-CEDICT is in these files.

tests/unit/hsk.test.js checks the files every time the tests run.
