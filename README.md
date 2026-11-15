# Hanzi Drill 习

Practise the Chinese words and sentences you have learnt. Bring in the lesson lists you save from
**Hanzi Grid** (the handwriting-sheet app), then drill them both ways on your iPhone: see the
characters and recall the pinyin and meaning, or see the pinyin and meaning and recall the
characters. Words you miss come back sooner (spaced repetition). It installs like a normal app
and then **works with no internet**.

Address: **https://johnbui765.github.io/CHINESE-PRACTICE-1/**

---

## 1. Install it (once)

You need the internet only for this step.

**iPhone (Safari)**
1. Open https://johnbui765.github.io/CHINESE-PRACTICE-1/ in **Safari**.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open it once from the Home Screen while you are online, so it can save itself for offline use.

> On iPhone, the Home Screen app and Safari keep **separate** storage. Always use the Home
> Screen icon.

**Windows (Chrome or Edge)**: open the address and click the **Install** icon at the right end of
the address bar. The app works there too.

---

## 2. Daily use

### Add a list

Tap **+** on the **Lists** tab (or **Add a list** on Today).

- **Open file…**: pick a `.txt` list you saved from Hanzi Grid (**Save list** there; the file is
  in the Files app).
- **Paste**: paste the text of a lesson, or an AI's reply to a Hanzi Grid prompt. The same reader
  is used, so everything Hanzi Grid reads, this app reads:
  ```
  # Bài 5
  女朋友 | nǚ péngyou | girlfriend
  = 我有一个女朋友。 | Wó yǒu yí ge nǚ péngyou. | I have a girlfriend.
  > 女 | nǚ | woman
  > 朋 | péng | friend
  > 友 | yǒu → you | friend
  哪 | nǎ | which
  ```
  A `> ` line is a character of the word above it; a `= ` line is its example sentence;
  `yǒu → you` means 友 is *yǒu* on its own but said *you* in this word.
- Check the preview, change the name if you like, tap **Save**.

### Practise

Open a list. Choose what to practise: **Words** (the words and sentences), **Characters** (the
characters listed under them) or **All**. Then pick a mode:

- **Word → Pinyin & meaning**: the characters are shown in the handwriting font 楷体 (and, small,
  in the screen font 黑体). Recall the pinyin and meaning, tap **Show answer**, then **Knew it** or
  **Didn't know**. The answer shows the pinyin (with the tone change arrow when there is one),
  the meaning, the example sentence with the word underlined, and the word's characters.
- **Pinyin & meaning → Word**: the other way round. Write the characters on paper or picture
  them, then check.

A card you miss comes back later in the same session. Every card is scheduled for review: after
1, 3, 7, 14 and 30 days when you keep knowing it, sooner when you miss it.

### Today

The **Today** tab shows how many cards are due, your streak, and the recent lists. **Start
review** drills the cards that are due across all your lists, in both directions. If the phone
closes the app in the middle of a session, Today offers to **Resume** it.

### Settings

What to practise by default, cards per review, auto-continue after grading, the print form on or
off, light or dark theme, and **Backup**: export your lists and progress to a file (Files or
iCloud Drive) and restore them on a new phone. The lists live only on this phone, so export a
backup now and then.

On a list, the **…** menu has **Edit list** (the text is opened again; words that stay keep their
progress), **Save as .txt file** (the lesson format, so Hanzi Grid can open it) and **Delete
list**.

---

## 3. Updates

When a new version is published, the app shows **A new version is ready · Update** the next time
it is opened online. Tap Update. Nothing you saved is lost.

---

## 4. Check list for the iPhone (do this once after installing)

- [ ] The Home Screen icon opens the app.
- [ ] **Try a sample list** on Today, open a card: the characters show in the handwriting font.
- [ ] Turn on **Airplane Mode**, close and open the app: it still works, the lists are there.
- [ ] **+** → **Open file…** → pick a `.txt` list from the Files app: the preview shows the words.
- [ ] Practise a list in both modes, then check Today shows the review count.
- [ ] Settings → **Export backup** → Save to Files.

---

## 5. Publish it on GitHub Pages (for the owner of the repository)

1. Create the **public** repository `JohnBui765/CHINESE-PRACTICE-1` (exactly this name: the app's
   identity on your devices is the path `/CHINESE-PRACTICE-1/`).
2. Put the project files in it (everything from the zip, except `node_modules/` and
   `tests/output/`). **Add file → Upload files** in the browser works: the website accepts at most
   100 files per upload, so upload the folders in two or three parts.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main /
   (root) → Save.**
4. After a minute or two the app is at https://johnbui765.github.io/CHINESE-PRACTICE-1/

All your apps share the address `johnbui765.github.io`, so this app keeps everything it stores
under its own name: the offline copies are named `chinese-practice-1-…`, its database is
`chinese-practice-1`, and it never touches another app's storage.

---

## 6. Where things come from (sources and licences)

- **KaiTi font:** AR PL UKai CN, © Arphic Technology, Arphic Public License. A cut-down copy,
  copied unchanged from Hanzi Grid; see `fonts/README.txt` and `fonts/LICENSE-ukai.txt`.
- **Print font:** Noto Sans SC (Regular), © Adobe, SIL Open Font License 1.1. A cut-down copy;
  see `fonts/README.txt` and `fonts/OFL-notosanssc.txt`.
- **Common characters:** `data/common3500.txt`, level 1 of 通用规范汉字表 (2013), from
  [shengdoushi/common-standard-chinese-characters-table](https://github.com/shengdoushi/common-standard-chinese-characters-table),
  cross-checked against the npm package `togscc` (see Hanzi Grid). `data/font-chars.txt` lists
  the characters both fonts have.
- **App icon:** the character 习 drawn from the stroke data of
  [animCJK](https://github.com/parsimonhi/animCJK) (Arphic Public License); see `icons/README.txt`.
- **Code:** the iPhone shell (navigation, components, storage, spaced repetition, practice engine)
  comes from Vocab Studio, the owner's English app; the lesson reader and pinyin modules from
  Hanzi Grid. MIT licence (`LICENSE`).
- No libraries are loaded from the internet. The app never calls an AI or any other website.

---

## 7. For developers

Everything below is only for changing the app. The app itself needs no installation.

```
npm install                  # Playwright, for the browser test and the icons (dev only)
npm test                     # unit tests (node:test), including the service worker's file list
npm run serve                # serve the app at http://localhost:8080/
node tools/serve.mjs 8080 --base=/CHINESE-PRACTICE-1/   # at the GitHub Pages path
npm run e2e                  # browser flow in Chromium at iPhone size; screenshots in tests/output/
node tools/update-sw.mjs     # after changing any app file: refresh the offline file list + version
node tools/make-icons.mjs    # re-render the PNG icons from icons/icon.svg
```

`CLAUDE.md` is the full specification and the plan for the next milestones (stroke order
animations and stroke-by-stroke writing practice come next).
