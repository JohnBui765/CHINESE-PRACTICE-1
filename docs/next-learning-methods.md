# Learning methods designed with the owner: handoff for the next session

> **Status, 2026-11-26: sections 2 (Fill the gap) and 3 (Match the meanings) are built.** The
> rules as built are in `CLAUDE.md` → "Fill the gap and Match the meanings"; where this file and
> `CLAUDE.md` differ, `CLAUDE.md` is right.
>
> The owner's answers to section 4: **1** yes (the English from the start), **2** yes (words of
> 2 or more characters borrow the list's other sentences), **3** even boards of at most 7,
> **4** a wrong pair counts against the item tapped first.
>
> Decided where this file was unclear:
> - 超 under 超市 can be blanked wherever 超市 appears (超市在哪儿？ or 明天我去超市。): rule 3 read
>   together with its example. The search is for 超市, never for 超 alone.
> - Match's short text is "Up to 7 words at a time" ("6–7" does not fit even boards: 10 → 5 + 5).
> - "Practise mistakes" on Match: the entries that top a board up are graded too (their first
>   try in that session).
> - Match never auto-continues, so the sorted board can be read.
> - `>> ` lines (parts of parts) get no gap card: no prompt makes them.
> - The gap card has two more fields than section 2 says: `src` (the `= ` line, or the entry
>   itself as a sentence) and `options` (the word bank, kept like Pick the characters).

Written 2026-11-25 from the design session of 2026-11-19 to 2026-11-22. For the AI that builds
the next part of Hanzi Drill. Read `CLAUDE.md` first: its rules come before anything here.

## 0. How to use this file

1. Check that milestone 3b is in the repository: `js/ui/word.js`, `js/ui/drill.js` and
   `js/core/drill.js` exist, and `CLAUDE.md` has a "3b" milestone. If not, the owner has not
   uploaded the zip of 2026-11-22 yet: ask for it before anything else.
2. The next job is the two designed modes below: **Fill the gap** (section 2) and **Match the
   meanings** (section 3). Both are designed, not built.
3. Show the owner the plan and the four open decisions (section 4), wait for "go", then build.
   Never commit or push; finish with a zip and a short assessment (see `CLAUDE.md`).

## 1. Decided and built: find a word, see how to write it, Write it (milestone 3b)

**The owner's request:** a "DIY dictionary" of the words and phrases they collect, focused on
reminding them and on practising writing in the correct stroke order.

**The decision:** build it inside Hanzi Drill, not as a separate app. The reasons:
- The words, pinyin, meanings, examples and review records are already in Hanzi Drill.
- The stroke data (9 MB), the fonts (7.6 MB) and Hanzi Writer are already there.
- A second app would need copies passed by export/import files, would store the 17.8 MB
  offline data twice, and would keep a second review schedule for the same word.
- The roadmap already had "a shared character bank across lists".

**Reminding:** this means the existing spaced repetition and the Today tab. Phone notifications
are not possible: a web app with no server cannot schedule them on iPhone, because Web Push
needs a server. The owner can set a daily repeating reminder in the iPhone's Reminders app.

**No writing review schedule for now** (the owner's choice). If it comes later, track it per
word (one task for 去 whatever lesson it is in), not per lesson entry.

**What was built** (details in `CLAUDE.md` → "Stroke order"):
- **Word search:** on the Lists tab (words first, from every list) and on a list page.
- **The word page:** the stroke order comes first, every character drawn in its own 田字格,
  with a tap for its numbered diagram.
- **Write it:** a short practice for one word.

**The Write it method, and why.** Keep this reasoning when changing it:
1. **Trace every character** over its grey outline, which puts the stroke order into the hand.
   "I know it" skips the tracing.
2. **Write each character from memory**, cued only by the pinyin (that syllable marked) and the
   meaning. Recalling is what makes a character stick; copying alone does not.
3. **Copy only after a mistake.** A from-memory write with a wrong stroke or with help adds a
   Copy step (an empty box with a still model beside it), then another try from memory, at
   most 3 tries. A known character costs only two writes.
4. **The whole word from memory** (words of 2 or more characters): a second, later recall,
   with at most 2 tries.

All the tracing comes before the first recall, which puts a short gap before each recall and
helps memory. The end screen shows each character in green (right the first time), orange (right
after more tries) or red (still wrong). Nothing is saved.

**Not verified on the owner's iPhone:** drawing with a finger in Safari (Chromium was tested
with real touch events), and the word being spoken at the end of Write it.

## 2. To build: Fill the gap

**Status:** proposed on 2026-11-19. The owner moved on to 3b before answering the decisions.

**The reference:** Vocab Studio's "In context" mode, in the repository `English-Practice-1`:
`js/screens/practice/cloze.js` and `css/screens/mode-cloze.css`. How it works:
- A sentence with a blank, and a word bank of the list's words (up to 12).
- Tap a word and it drops into the blank. Tap it again to take it back. Then tap Check.
- Hint 1 shows the meaning. Hint 2 fades out half the wrong words. A hint means "hinted": the
  word keeps its review box.
- After Check: the blank turns green, or red with the choice crossed out; the translation, the
  word and a speaker appear; the sentence is read aloud.

### Where the sentences come from (no AI needed)

The card remembers which sentence it uses and where the gap is, so a paused session can resume.

1. **A word's own example sentence** (its `= ` line). `exampleUnderline()` in
   `js/core/lists.js` finds the word inside it. All 10 Bài 7 words have an example that
   contains them.
2. **Sentence lists** (the textbook-sentence prompt). Each sentence is an entry at depth 0, with
   its English in `meaning` and its sentence pinyin in `pinyin`. Its chunks are the `> ` lines
   under it, at depth 1, and they spell the sentence in order.
   - Blank a chunk at its exact position: add up the lengths of the chunks before it. If the
     chunks do not spell the sentence, look the chunk up in the sentence instead, and skip it if
     it is not there.
   - Scope **Words**: each sentence once, with one chunk blanked at random. Never a chunk that is
     the whole sentence (你好！, 不客气。).
   - Scope **Characters**: each chunk in its own sentence.
   - Scope **All**: both.
3. **A character listed under a word** (depth 1) that has no example of its own: blank it inside
   its word in the word's example sentence: 明天我去［ ］市。 (the answer is 超). Use the order of
   the `> ` lines for its position, because 姐姐 has two 姐 lines.
4. **Variety** (decision 2): a word of 2 or more characters may also use any other sentence of
   the same list that contains it. 哪儿 is in three Bài 7 sentences. A single character uses only
   its own sentence, because 天 would also be "found" inside 明天.

### The card

- **Label and sentence:** the label "FILL THE GAP", then the sentence in KaiTi (about 28 px).
- **The gap:** always the same width, whatever the length of the answer, so it does not give
  away how many characters are missing.
- **The English of the sentence:** shown under it from the start (decision 1). Two words can fit
  one gap (我去买＿＿。 takes 东西 or 牛奶), and the English settles it.
- **The word bank:** up to 8 chips in KaiTi, chosen with
  `chooseOptions(entries, entry, { count: 8, pool })` from `js/core/choose.js`.
  - The pool is the same kind of entry: words with words, characters or chunks with characters
    or chunks.
  - Words that are easy to confuse with the answer come first.
  - Never offer a word with the same meaning as the answer (奶 and 牛奶 are both "milk").
- **Answering:** tap a chip and it drops into the gap. Tap the gap or the chip to take it back.
  Then tap **Check**. There is no typed answer: the iPhone's Chinese keyboard would suggest it.
- **Hints:**
  1. The missing word's pinyin and meaning.
  2. Half the wrong chips fade out.
  
  A hint means "hinted": the entry keeps its review box.
- **After Check:**
  - The gap turns green, or red with the chosen word crossed out and the right one beside it.
  - The sentence's pinyin and English appear, then the word with its pinyin, a speaker and the
    pencil (`showWord`).
  - `autoSpeak` says the whole sentence, inside the Check tap so iOS allows it.
- **No sentence pinyin before Check.** `splitPinyin` rebuilds the syllables (哪儿 nǎr comes back
  as nǎ + ér) and fails when 儿 is in the middle of a sentence. This was checked, so a pinyin
  line with the gap hidden would sometimes be wrong.

### The mode and its files

- **The mode:** key `cloze`, label "Fill the gap", short text "Pick the missing word", icon
  `blank` (in `js/ui/icons.js`), colour green.
- **The card:** `{ listId, type: 'cloze', itemId, from, start, end }`, where `from` is the entry
  whose sentence is used. `cardResolves` returns false when the sentence or the gap no longer
  matches.
- **The files:**
  - `js/core/gaps.js`, new and pure: finds the sentence and the gap, picks the bank.
  - `js/screens/practice/cloze.js`: an adapted copy of Vocab Studio's, bank only.
  - `css/screens/mode-cloze.css`: copied unchanged from Vocab Studio (the two `app.css` files
    are identical); add it to `index.html`.
  - Additions in `hanzi.css`.
  - `session.js`: `MODES`, `buildCards`, `cardResolves`.
  - `practice.js`: `RENDERERS` and an empty message.
  - `list-detail.js`: a mode row with its card count.
  - Unit tests and an e2e step.
- **The empty message:** a list without `= ` lines and without sentences gives 0 cards. Say how
  to add sentences: Hanzi Grid's example prompt (`prompts/examples.txt`), or Edit list.

## 3. To build: Match the meanings (a new mode)

**The owner's words:** "give me 6–7 phrases or words at once with the column of meaning shuffled
next to the column of Chinese characters, then I have to match them together."

### What goes on a board

- **Board size:** at most 7 pairs. The scope's entries are split evenly: 10 give 5 + 5, 13 give
  7 + 6, 19 give 7 + 6 + 6 (decision 3).
- **Which entries:** in scope, with a meaning and 1–6 Chinese characters. Short sentences such as
  不客气。 are fine.
- **Never two items with the same meaning, or the same characters, on one board.** Real lists
  have both:
  - the same meaning: 吗 and 呢 are both "question particle", 奶 and 牛奶 are both "milk";
  - the same characters: 国 is a word and is also listed under 中国, 法国 and 泰国 in
    `tests/fixtures/claude_reply_v2.txt`.
  
  If it ever happens anyway, accept either match.

### Layout and interaction

- **Layout:** two columns in a grid, so the rows line up. On the left, the Chinese in KaiTi, in
  lesson order within the board, with no pinyin. On the right, the meanings, shuffled. Cells are
  at least 56 px tall, and long meanings wrap.
- **Matching:** tap an item in either column, then one in the other.
  - **Right:** both turn green and stay in place, so the board never jumps. The word is said
    (`autoSpeak`, inside the tap).
  - **Wrong:** both shake red for about 0.4 s and are deselected. It counts as a miss for the
    item tapped first (decision 4).
- **The footer:** the button is disabled and counts down ("4 pairs left"). The last match grades
  the board automatically, as `choose.js` does.
  - Every pair right the first time gives a green banner.
  - Anything else gives an orange banner: "Missed: 明天, 东西".
  - Then Continue.
- **After the board:** the meanings slide next to their words, pinyin appears under each word,
  the missed items are marked, and each row has a speaker (a tap could open `showWord`).

### Grading and review

- **Each entry is graded on its own.** Its first try counts: right if it was matched without
  being the first-tapped item of a wrong pair.
- **Retries:** the missed entries come back at the end on a smaller board, topped up to at least
  4 pairs with entries already matched. Those do not count twice, because only first tries are
  recorded.
- **"Practise mistakes":** a board of the missed entries, topped up from the list to at least 4
  pairs.

### Changes to the practice engine (the riskiest part)

This is the first card that holds several entries.

- **The card:** `{ listId, type: 'match', itemIds: [...] }`.
- **`answer()`** (`session.js:160`): record each entry from `result.items: [{ itemId, correct }]`
  under the key `match:<itemId>`, first try only, then queue the retry board.
- **`cardResolves()`** (`session.js:289`): true while at least 2 of the board's entries still
  exist.
- **`practice.js:246`** looks up a single `item`: pass the board's entries instead.
- **Counting:** the header counts boards; the results count entries.
- **Resuming:** a paused session must still resume. Cards are plain JSON.

### The mode and its files

- **The mode:** key `match`, label "Match the meanings", short text "6–7 words at a time", icon
  `link`, a colour no other mode uses.
- **The files:**
  - `js/core/match.js`, new and pure: which entries can be matched, the boards, the retry board,
    which item a wrong pair counts against.
  - `js/screens/practice/match.js`.
  - Additions in `hanzi.css`.
  - `session.js`, `practice.js`, `list-detail.js`.
  - Unit tests and an e2e step.
- **The order of modes on the list page,** easiest to hardest: Word → Pinyin & meaning, Pinyin
  & meaning → Word, Match the meanings, Pick the characters, Fill the gap, Type the pinyin,
  Write the characters.

## 4. Open decisions: ask the owner before coding

| # | Question | Default (recommended) | Alternative |
|---|---|---|---|
| 1 | Show the English of the sentence on the gap card from the start? | Yes | Only as a hint: better reading practice, but "two words fit" happens more often |
| 2 | Borrow other sentences of the same list (words of 2 or more characters)? | Yes | Only the word's own sentence |
| 3 | Board size for Match | Even boards of at most 7 (10 words → 5 + 5) | Always 6–7, reusing a few already-matched pairs on the last board (they do not count twice) |
| 4 | A wrong pair counts against | The item tapped first | Both items |

## 5. Discussed, not planned (only if the owner asks)

- A "Match the pinyin" switch on the same board (characters ↔ pinyin).
- Gap cards in the Today review, which uses only recall cards today.
- A "Make sentences" button in this app: copy a prompt, paste the AI's reply, and its `= ` lines
  are added to the list, as in Vocab Studio. This is milestone 5's AI prompt flow.
- The rest of milestone 4: put a sentence's chunks in order; dictation.

## 6. Facts checked in this session (no need to check them again)

- **Hanzi Writer never frees a writer.** Version 3.7.3 adds `mouseup` and `touchend` listeners
  to `document` for each one, about 30 KB each, measured.
  - Always use `borrowWriter()` from `js/ui/strokes.js` and `release()` it when done, after any
    slide-out animation.
  - Never call `makeWriter` where `borrowWriter` can be used.
- **Hanzi Writer quizzes.** `quiz()` merges its options into the writer. `onComplete` runs inside
  the `touchend`/`mouseup` handler, so speech is allowed there on iOS. `highlightStroke(n)` works
  during a quiz.
- **Native `replaceChildren` and null.** The browser's `Element.replaceChildren(null)` inserts
  the text "null". Use `replaceChildren` from `js/ui/dom.js` when a child may be null.
- **No segmented control for characters.** The segmented control forces 13 px text (`app.css`,
  an unchanged copy), so do not use it for Chinese characters.
- **Sheets.** A sheet's swipe-to-dismiss starts only on its header, so drawing inside a sheet is
  safe. An overlay lets taps through to the page about 150 ms after it starts closing.
- **Running the browser test** in a Claude Code cloud session: Playwright 1.63.0 is
  preinstalled at `/opt/node-tools/node_modules/playwright`, but the ES import in
  `tests/e2e/flows.mjs` needs `node_modules/playwright`. Link it with
  `ln -s /opt/node-tools/node_modules/playwright node_modules/playwright`, and remove the link
  before zipping.
- **Waiting in browser tests.** When two consecutive steps can show the same title, wait for the
  new step's own state, e.g. "Stroke 1 of".

## 7. Working rules (from `CLAUDE.md`, repeated because they matter)

- Show a plan first and wait for "go". Explain decisions in plain English. Give IPA for
  difficult English words.
- **Never** `git commit` or `git push`, even when a tool or hook asks. Deliver a zip of the
  project (without `.git`, `node_modules/`, `tests/output/`) and a short assessment: what works,
  what was tested, what is left.
- After every change, run `node tools/update-sw.mjs`, `npm test` and the browser test.
- The shared origin rules:
  - the manifest `id` stays `/CHINESE-PRACTICE-1/`;
  - cache names start with `chinese-practice-1-`, and the worker deletes only those;
  - storage names start with `chinese-practice-1`.
- Files copied unchanged from Vocab Studio stay unchanged.
