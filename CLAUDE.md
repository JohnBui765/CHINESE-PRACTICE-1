# Hanzi Drill — practise the Chinese words and sentences you have learnt (iPhone PWA)

An offline web app (PWA) for drilling the words, characters and sentences of the owner's HSK
lessons. Its input is the **lesson list** that Hanzi Grid (repository
`CHINESE-HANDWRITING-PRACTICE-1`) saves: words with pinyin and meaning, their characters on `> `
lines, example sentences on `= ` lines. It is iPhone-first (Safari, added to the Home Screen) and
also works in Chrome or Edge on Windows. The owner is an HSK 1 beginner.

**The app never calls an AI, an API or another website.** After the first visit everything works
with no connection.

## How to work with me (read first)

- **Never `git commit` or `git push`.** When a milestone is done, give me a zip of the project
  folder (without `.git`, `node_modules/`, `tests/output/`) and a short assessment: what works,
  what was tested, what is left.
- **Show a plan before writing code**, and again before any large change.
- I'm learning to program. Explain decisions in plain English, briefly. No clever tricks where
  plain code works.
- Don't add dependencies beyond the lists below without asking.
- No network at runtime except loading the app's own files: no CDN, no web fonts from other
  sites, no analytics.
- Build efficiently and economically: reuse the shared shell, write only what is new.

## Tech stack (fixed)

- Plain HTML, CSS and JavaScript ES modules. No framework, no TypeScript, no bundler: the files
  in the repo are exactly the files the browser loads.
- Browsers: Safari on iPhone (iOS 17 or newer), Home Screen app; Chrome or Edge on Windows.
- **Runtime libraries** live in `vendor/` with their licence files and an exact version in
  `vendor/VERSIONS.txt`; never from a CDN. Vendor files end in `.js`.
  - **Hanzi Writer 3.7.3** (MIT): `vendor/hanzi-writer.esm.js` = the package's `dist/index.esm.js`
    unchanged (self-contained ES module). Animates strokes and quizzes writing. Always pass
    `charDataLoader` with the app's own data: the library's default loader fetches a CDN.
- **Dev-only tools:** Node 22 (`node --test`, no test library); `playwright` 1.63.0 pinned in
  `package.json` for the browser test and the icons. Nothing is shipped from `node_modules/`.

## Where the code comes from (keep it that way)

Two of the owner's apps were reused. Files copied **unchanged** stay unchanged, so a fix in one
app can be copied to the other:

- From **Vocab Studio** (`English-Practice-1`): `css/app.css` (design system), `css/screens/`
  (`today`, `lists`, `practice`, `mode-flashcard`, `settings`), `js/ui/` (`dom`, `components`,
  `icons`, `router`, `viewport`, `clipboard`), `js/core/` (`util`, `srs`, `text`),
  `js/data/db.js`, `tools/serve.mjs`, the srs tests. Only storage names were changed (see
  "Hosting and offline"). `js/data/store.js`, `js/screens/practice/{session,practice,results}.js`,
  `today.js`, `lists.js`, `settings.js` are adapted copies.
- From **Hanzi Grid**: `js/core/extract.js` (the lesson and reply reader), `js/core/pinyin.js`,
  `js/core/listedit.js`, `data/common3500.txt`, `data/font-chars.txt`, `fonts/` (the two subset
  fonts, licences), `prompts/`, their tests and fixtures. Unchanged.
- New here: `js/core/{lists,strokes,pinyincheck,choose}.js`, `js/data/{chars,sample,strokes}.js`,
  `js/ui/{files,strokes}.js`, `js/ui/speech.js` (Vocab Studio's, pointed at Chinese voices),
  `js/screens/{import,list-detail}.js`, `js/screens/practice/{recall,write,pinyin,choose}.js`,
  `css/screens/hanzi.css`, `tools/{update-sw,make-icons,make-strokes}.mjs`, `icons/`,
  `data/strokes/`, the tests in `tests/unit/{lists,session,strokes,pinyincheck,choose,speech}.test.js`
  and `tests/e2e/flows.mjs`.

## Pronunciation

- `js/ui/speech.js`: the Web Speech API with the device's **Chinese** voices (`zh`, `cmn`,
  `yue` language tags), offline on iPhone. `speak(text, { rate, voiceURI })` is synchronous and
  must be called inside a tap handler (iOS); the first tap anywhere calls `unlock()` (app.js).
  Voices are ranked Premium > Enhanced > Standard (read from the voice id, Apple reuses names),
  then by a preferred-name list (Tingting, Li-mu, Yushu, Xiaoxiao, Meijia, Sinji…), then
  mainland Mandarin > Taiwan > Cantonese. `bestVoice(voices, savedURI)` upgrades a saved basic
  voice to its downloaded copy. The app always speaks **characters**, never pinyin.
- Speakers: the front of a recall card only when the characters are the question (hearing the
  word gives away the pinyin), the back of every recall card, example sentences, the entry
  sheet, the Strokes sheet, the pick-the-characters prompt, after a typed-pinyin answer, the
  results rows. `autoSpeak` says the word when an answer is revealed (recall, pinyin, write).
- Settings: Voice (sheet: Automatic, best quality, standard, a raw list of every voice with
  Copy, and how to download a voice), Speed (0.5–1.2, default 0.9), "Say the word with the
  answer", Test voice (你好！我想喝水。).

## Typed pinyin and picking characters

- `js/core/pinyincheck.js` (pure): `syllableParts` (tone marks or numbers, ü as ü/v/u:),
  `markSyllable` (the mark goes on a or e, else o in ou, else the last vowel), `applyToneToLast`
  (what the tone bar does: marks the longest valid syllable at the end of the text, keeps
  earlier marks; tone 5 removes), `toSyllables` (uses `splitPinyin` with the entry's
  characters; punctuation stripped), `gradePinyin(input, entry, { tonesRequired })` →
  `{ correct, close, message, expected }`: letters and tones right = correct; letters right but
  tones wrong or missing = close (orange); with tones not required, missing tones are fine but
  typed wrong tones still count; the dictionary pinyin and the pinyin as said are both accepted;
  儿 forms (nǎr / nar3 / nǎ ér) and a missing apostrophe (xi an) are handled.
- Mode `pinyin` (`js/screens/practice/pinyin.js`): entries with pinyin and ≤ 6 characters
  (`canTypePinyin`); a text field with `answer` attributes, Enter checks; the tone bar keys
  cancel mousedown so the keyboard stays up; after Check the field turns green or red and the
  answer with a speaker appears.
- `js/core/choose.js` (pure): `chooseOptions(entries, entry, { count: 4, rng, pool })` → ids,
  the right one in a random place; words sharing a character first, then the same length; the
  same text never twice; sentences over 6 characters never offered. Mode `choose`
  (`choose.js`): entries with a side B; the pool is the same kind of entry (words with words,
  the "> " characters with characters); tapping a tile answers; cards remember their `options`.

## Stroke order (data and rules)

- **Source:** animCJK `graphicsZhHans.txt` (simplified Chinese, mainland-China stroke order),
  GitHub `parsimonhi/animCJK`, commit `c63765b150cbd567c71d05cf4a4f8d00b57045c9`, SHA-256
  pinned in `tools/make-strokes.mjs`. It derives from Make Me a Hanzi and the Arphic KaiTi fonts.
  **Arphic Public License**: `data/strokes/ARPHICPL.TXT` unchanged, `data/strokes/README.txt`
  says how and when the data was changed, and the data stays freely available in the public
  repo (the same duties as the KaiTi font). The two candidate sources (animCJK and
  `hanzi-writer-data` 2.0.1) differ on 10 of the 3,500 characters: 冉肠盖甥衙滚潇慧翰髓.
- **What ships:** the 3,500 common characters (`data/common3500.txt`), all covered, about
  9 MB: `data/strokes/<block>.json`, one file per 256 code points (`4e.json` = U+4E00–U+4EFF),
  mapping a character to `{ s: [SVG path per stroke], m: [[x, y] points per stroke] }`;
  `data/stroke-chars.txt` lists the characters with data. Coordinates: a 1024-unit box, y up,
  top at 900, bottom at −124 (`glyphTransform` in `js/core/strokes.js` draws it). Rebuild with
  `node tools/make-strokes.mjs` (the source is cached in `tools/cache/`, not in git).
- **Loading:** `js/data/strokes.js` fetches one block file at a time, once, from the service
  worker's cache; `strokeChars()` gives the Set of characters with data.
- **Strokes sheet** (`showStrokes(word)` in `js/ui/strokes.js`): a picker of the word's
  characters, a 田字格 with the character animating (outline shown), Play again, One stroke at a
  time, Slower, the numbered diagram (cell i = strokes 0..i, the newest red with its number at
  the start of its median), and the note that the order is the mainland standard. Opened from
  the entry sheet on the list page and from the pencil on the back of a recall card.
- **Writing mode** (`write`): cards for entries in scope whose word has 1–4 Chinese characters
  all with data (`writableChars`; a card remembers its `chars`). One 田字格 per character; the
  quiz runs on one character at a time (`leniency`, `showHintAfterMisses` from the settings,
  backwards strokes refused). Grading: no mistakes and no outline → right; mistakes, the
  outline or a hint → correct but `hinted` (keeps the box); three automatic hints, or "Can't
  remember" (the strokes are then animated) → wrong. The stroke data of a session's cards is
  fetched once in `practice.js` and passed as `ctx.strokes`. `touch-action: none` on the box so
  drawing never scrolls.

## Hosting and offline

- Public repo `johnbui765/CHINESE-PRACTICE-1`, GitHub Pages from the `main` branch root:
  `https://johnbui765.github.io/CHINESE-PRACTICE-1/`.
- **All my PWAs share one origin** (`johnbui765.github.io`): they share Cache Storage,
  localStorage and IndexedDB. So this app keeps everything under its own name, the repo name:
  - `manifest.webmanifest`: `"id": "/CHINESE-PRACTICE-1/"` (never `"./"` or `"/"`: `id`
    resolves against the site root, not the app folder), `"start_url": "./"`, `"scope": "./"`,
    `"display": "standalone"`, name and short name `Hanzi Drill`, icons 192, 512 and a maskable
    one; `index.html` links a 180 × 180 `apple-touch-icon`.
  - Service worker `sw.js`, registered with scope `./`. Cache names are
    `chinese-practice-1-<VERSION>`; `VERSION` (a hash of all shipped files) and the `PRECACHE`
    list are written by `node tools/update-sw.mjs`. **Run it after every change**; a unit test
    fails when it is out of date. The worker opens only its own cache by name (never
    `caches.match()`), deletes on activate only caches that start with `chinese-practice-1-`,
    serves cache first then network, and answers navigations with the cached shell. A new version
    is offered with an **Update** toast; tapping it sends `SKIP_WAITING`.
  - IndexedDB database `chinese-practice-1` (stores `lists`, `progress`, `settings`, `history`).
    localStorage keys start with `chinese-practice-1.` (`nav`, `session`, `import.draft.<id>`,
    `installHintDismissed`). Never call `localStorage.clear()` or touch other keys.
  - Ask once for persistent storage; ignore the answer.
- Precached: `index.html`, `manifest.webmanifest`, `css/`, `js/`, `icons/`, `fonts/*.ttf`,
  `data/*.txt`, `prompts/*.txt`, `vendor/` (without licence and readme files). Not `tests/`,
  `tools/`, `docs/`.

## Fonts

The same two subsets as Hanzi Grid, copied unchanged (full subsets, the owner's decision):
`fonts/ukai-cn.ttf` (AR PL UKai CN, Arphic Public License) for the handwriting shape 楷体 and
`fonts/noto-sans-sc.ttf` (Noto Sans SC Regular, OFL) for the print shape 黑体. CSS `@font-face`
`'Hanzi Kai'` / `'Hanzi Print'`, classes `.kai` / `.print` (`css/screens/hanzi.css`). Characters
missing from the fonts are flagged red on the list page (`data/font-chars.txt`), characters not
among the 3,500 common ones orange (`data/common3500.txt`).

## Data model

```js
// List (IndexedDB "lists")
{ id, name, rawText, entries: Entry[], createdAt, updatedAt, lastPracticedAt }
// Entry = a Hanzi Grid entry plus an id. From readText() in js/core/extract.js:
{ id, word, depth, pinyin, said, meaning, page, unsure, example, examplePinyin, exampleMeaning, exampleUnsure, ... }
//   depth 0 = a word or sentence; 1 = a "> " part (a character, a sentence's chunk); 2 = a part of a part
//   said = the pinyin as said in the word when it differs ("yǒu → you": said = "you")
// Progress (store "progress", key itemId = entry id): Leitner box
{ itemId, listId, box: 0..5, due, seen, right, wrong, last }
// History: { at, listId, mode, total, correct }
// Settings (store "settings"; defaults in js/data/store.js DEFAULT_SETTINGS):
{ theme: 'system'|'light'|'dark', scope: 'words'|'chars'|'all', reviewLimit: 20, autoAdvance: 0, showPrint: true,
  writeOutline: false, writeHintAfter: 3, writeLeniency: 1, pinyinTones: true, voiceURI: '', speechRate: 0.9, autoSpeak: true }
```

- `withIds(entries, oldEntries)` (`js/core/lists.js`) gives ids; on **Edit list** an entry with
  the same word at the same depth keeps its id (in order), so its progress survives.
- Backups: `{ app: 'chinese-practice-1', version: 1, lists, progress, settings, history }`;
  merge or replace (one transaction).

## Screens

Tabs **Today · Lists · Settings** (the Vocab Studio shell: navigation stack with swipe back,
restored after iOS evicts the app; modals from the bottom).

- **Today:** onboarding on first run (Add your first list / Try a sample list: Bài 7), storage
  warning, install hint, a paused session to Resume, the review card (cards due + new, Start
  review), streak / mastered / words tiles, recent lists, Add a list.
- **Lists:** every list with its counts ("10 words · 9 characters"), a status badge (`n due` /
  New), search over names, words, pinyin and meanings (accent-free).
- **New list / Edit list** (modal, `js/screens/import.js`): Paste (clipboard) or Open file…
  (`.txt`; UTF-8, UTF-16 with BOM, GB18030), the text box, the name (taken from the `#` line or
  the file name until the owner edits it), notices from the reader (`# continue`, `# nothing to
  copy`, an echoed format example, repeats removed, a wrong `# total`), a preview of the entries,
  Save. A draft survives the app being closed (24 h).
- **List** (`list-detail.js`): New / Learning / Reviewing / Mastered for the current scope; the
  **Practise** control (Words · Characters · All, the `scope` setting); the two modes with their
  card counts; "Review what is due"; every entry as a row (KaiTi, print form, pinyin with arrow,
  meaning, example in KaiTi with pinyin and English, progress, warnings), parts indented; a tap
  opens the entry sheet. **…** menu: Edit list, Save as .txt file (`toLessonText`, Share sheet or
  download), Delete list.
- **Practice** (modal): header (close, progress, counter), the card, footer **Show answer → Didn't
  know / Knew it → Continue**; wrong cards are re-queued at the end (at most 2 extra tries);
  the session is saved as soon as the last card is graded; the snapshot lets a session resume.
- **Results:** accuracy ring, Knew / Missed / Time, the missed entries, Practise mistakes.
- **Settings:** what to practise, cards per review, continue after grading, show the print
  form, theme, backup export/restore, storage, help sheets.

### Practice rules

- **Scope:** `words` = entries at depth 0 (words and sentences), `chars` = depth ≥ 1, `all`.
- **Modes:** `recall` (Word → Pinyin & meaning) makes one card per entry in scope;
  `recallReverse` (Pinyin & meaning → Word) and `choose` (Pick the characters) only for entries
  with pinyin or meaning; `pinyin` (Type the pinyin) for entries with pinyin and ≤ 6
  characters; `write` (Write the characters) only for words of 1–4 characters with stroke data.
  Cards are `{ listId, type: 'recall', itemId, dir: 'word' | 'meaning' }`,
  `{ type: 'write', chars }`, `{ type: 'pinyin' }` or `{ type: 'choose', options: [ids] }`.
  Every type updates the same progress record; the worst outcome of an entry's cards in a
  session counts. The Today review uses recall cards in both directions.
- **Review (Today):** cards due now across all lists. An entry that has ever been practised comes
  back whatever the scope setting; never-practised entries count only inside the scope. Entries
  being learned come before brand-new ones; the limit is `reviewLimit`; each card gets a random
  direction (meaning only when the entry has a side B).
- **Spaced repetition** (`js/core/srs.js`, unchanged from Vocab Studio): Leitner boxes 0–5,
  intervals 0, 1, 3, 7, 14, 30 days at local midnight; right = up a box, wrong = box 1 and due
  now; a right answer on a card that is not yet due keeps its box (`practise()`).

## Files and folders

```
index.html, manifest.webmanifest, sw.js
css/app.css, css/screens/*.css           design system; hanzi.css = fonts + Chinese pieces
js/app.js                                boot: database, settings, theme, router, service worker
js/core/   extract.js pinyin.js listedit.js (Hanzi Grid) · util.js srs.js text.js (Vocab Studio) · lists.js strokes.js pinyincheck.js choose.js (new)
js/data/   db.js store.js chars.js sample.js strokes.js
js/ui/     dom.js components.js icons.js router.js viewport.js clipboard.js files.js strokes.js speech.js
js/screens/ today.js lists.js import.js list-detail.js settings.js index.js
js/screens/practice/ session.js practice.js recall.js write.js pinyin.js choose.js results.js
vendor/ hanzi-writer.esm.js (+ licence, VERSIONS.txt)
fonts/ data/ (common3500, font-chars, strokes/, stroke-chars) prompts/ icons/
tests/unit/*.test.js (npm test) · tests/e2e/flows.mjs (npm run e2e) · tests/fixtures/
tools/ serve.mjs update-sw.mjs make-icons.mjs make-strokes.mjs (cache in tools/cache/, not in git)
```

Browser test (`tests/e2e/flows.mjs`): serves the app at `http://localhost:8123/CHINESE-PRACTICE-1/`
(the GitHub Pages path), Chromium at iPhone size: onboarding → sample list → a full recall
session → results → Today stats → paste Bài 7 → the Strokes sheet (牛 has 4 diagram cells) →
pick the characters (the tile matching the pinyin shown) → type the pinyin (one card with the
tone bar, one typed with marks) → a writing card drawn stroke by stroke along the data's
medians with the mouse (reads the writer's SVG transform, so it tests the real quiz) → the
Settings pronunciation section and voice sheet (no voices in headless Chromium) → manifest id →
service worker cache prefix → other apps' caches untouched → offline reload with the KaiTi font.
Screenshots in `tests/output/`.

## Milestones

1. **Shell and recall cards** — done: lists from Hanzi Grid files or paste, two recall modes,
   spaced repetition, Today, backup, offline, tests.
2. **Strokes** — done: the Strokes sheet and the writing mode (see "Stroke order"), Hanzi
   Writer vendored, the data pipeline, settings for hints, strictness and tracing. Not built:
   a draw-and-grade-yourself fallback for characters without data (the writing mode simply
   skips such words; all 3,500 common characters have data).
3. **Typed pinyin, pick the characters, pronunciation** — done (see "Typed pinyin and picking
   characters" and "Pronunciation"). Not verified: how the voices sound on the owner's iPhone;
   headless Chromium has no voices, so the browser test only checks that the screens work.
4. **Sentences:** fill the blank in an example sentence from a word bank, put a sentence's chunks
   in order, dictation (hear the sentence, write the characters or the pinyin).
5. **Polish:** the AI prompt flow (Copy prompt / paste reply, filling in pinyin, meanings and
   example sentences like Hanzi Grid), README checklist on the owner's iPhone, a shared
   character bank across lists.

## Out of scope

- OCR, calling any AI or online API, making pinyin from characters.
- Stroke-order rows printed on paper: that belongs to Hanzi Grid (a later milestone there).
- A native iPhone or Windows app.
