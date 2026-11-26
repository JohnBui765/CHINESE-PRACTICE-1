// End-to-end check in Chromium at iPhone size: the app serves at the GitHub Pages path, the
// sample list loads, a recall session runs to its results, a list is pasted in, a word is found
// and its word page shows how to write it, "Write it" runs with a deliberate mistake, every
// practice mode runs, the manifest id resolves to the repository path, the service worker caches
// under the app's own prefix, the app works offline, and other apps' caches are left alone.
// Screenshots go to tests/output/.
// Usage: node tests/e2e/flows.mjs   (needs Playwright + Chromium)
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 8123;
const PATH = '/CHINESE-PRACTICE-1/';
const BASE = `http://localhost:${PORT}${PATH}`;
const OUT = new URL('../output/', import.meta.url);
const root = new URL('../../', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, OUT));

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT), `--base=${PATH}`], { cwd: root, stdio: 'ignore' });
let browser;
try {
  await waitForServer(BASE);
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB' });
  const page = await context.newPage();
  const errors = [];
  // The router ignores taps while a screen transition runs (#app gets the class "busy").
  const idle = () => page.locator('#app:not(.busy)').waitFor({ state: 'attached' });
  // Draws every stroke of the character in a 田字格 box along the data's centre lines, with the
  // mouse; reads the writer's SVG transform, so the real Hanzi Writer quiz checks it.
  // reverseFirst: draw the first stroke backwards once first (a mistake the quiz refuses).
  const drawChar = async (box, { reverseFirst = false } = {}) => {
    await box.locator('.sk-target svg g[transform]').first().waitFor();
    const info = await box.evaluate(async (el) => {
      const svgEl = el.querySelector('.sk-target svg');
      const g = svgEl.querySelector('g[transform]');
      const m = g.getAttribute('transform').match(/translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([-\d.]+),\s*([-\d.]+)\)/);
      const r = svgEl.getBoundingClientRect();
      const { strokeData } = await import(new URL('js/data/strokes.js', document.baseURI).href);
      const data = await strokeData(el.dataset.char);
      return { left: r.left, top: r.top, tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]), medians: data.medians };
    });
    const line = async (median) => {
      const pts = median.map(([x, y]) => [info.left + info.tx + x * info.scale, info.top + info.ty - y * info.scale]);
      await page.mouse.move(pts[0][0], pts[0][1]);
      await page.mouse.down();
      for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    };
    if (reverseFirst) await line([...info.medians[0]].reverse());
    for (const median of info.medians) await line(median);
  };
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. First run: onboarding, then the sample list.
  await page.goto(BASE);
  await page.getByText('Practise what you learnt').waitFor();
  await page.screenshot({ path: shot('01-today-first-run.png') });
  await page.getByRole('button', { name: 'Try a sample list' }).click();
  await page.getByText('10 words · 9 characters').first().waitFor();
  await page.getByText('超市').first().waitFor();
  await page.screenshot({ path: shot('02-list.png'), fullPage: false });

  // 2. A recall session: show the answer, grade, until the results screen.
  await page.getByText('Word → Pinyin & meaning').click();
  await page.locator('.fc-card').waitFor();
  await page.screenshot({ path: shot('03-card-front.png') });
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.waitForTimeout(400);
    if (i === 0) await page.screenshot({ path: shot('04-card-back.png') });
    await page.getByRole('button', { name: i === 2 ? "Didn't know" : 'Knew it' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(500);
  }
  // The missed card comes back once more.
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Knew it' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Great work!').waitFor();
  await page.getByText('90%').waitFor();
  await page.screenshot({ path: shot('05-results.png') });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Learning').first().waitFor();

  // 3. Back on Today (the sample list was opened from there): the stats and the review card.
  await idle();
  await page.locator('.nav-back').first().click();
  await page.getByText('day streak').waitFor();
  await page.getByText('mastered', { exact: true }).waitFor();
  await page.screenshot({ path: shot('06-today.png') });

  // 4. Paste a list (the Bài 7 lesson) and save it.
  await idle();
  await page.locator('.screen:not(.covered) .tabbar').getByText('Lists').click();
  await idle();
  await page.getByRole('button', { name: 'New list' }).click();
  const text = await readFile(new URL('tests/fixtures/bai7.txt', root), 'utf8');
  await page.locator('.imp-text').fill(text);
  await page.getByRole('button', { name: /Save 10 words · 9 characters/ }).click();
  await page.getByText('Bài 7').first().waitFor();
  await page.getByText('牛奶').first().waitFor();

  // 4b. The word page from an entry shows how to write it straight away: a box per character
  // and the numbered diagram of the first (牛, 4 strokes); tapping 奶 shows its 5.
  const entryRow = (word) => page.locator('.ent', { has: page.locator('.ent-zh', { hasText: new RegExp(`^${word}$`) }) }).first();
  await idle();
  await entryRow('牛奶').click();
  await page.locator('.wd-sheet .sk-cell').first().waitFor();
  assert.equal(await page.locator('.wd-sheet .wd-box').count(), 2, 'a box per character');
  assert.equal(await page.locator('.wd-sheet .sk-cell').count(), 4, '牛 has 4 strokes');
  await page.locator('.wd-box[data-char="奶"]').click();
  assert.equal(await page.locator('.wd-sheet .sk-cell').count(), 5, '奶 has 5 strokes');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot('08-word-page.png') });
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(500);

  // 4g. The search box on the list page keeps the entries that match: chao = 超市 and 超.
  await page.locator('.ld-search input').fill('chao');
  await page.waitForFunction(() => document.querySelectorAll('.ld .ent').length === 2);
  assert.deepEqual(await page.locator('.ld .ent .ent-zh').allTextContents(), ['超市', '超']);

  // 4h. Write it: trace both characters, write 超 from memory with its first stroke drawn
  // backwards once (so the Copy step comes), copy it, write it again, then 市, then the word.
  await entryRow('超市').click();
  await page.getByRole('button', { name: 'Write it' }).click();
  const writeStep = async (title, opts = {}, name = null) => {
    // A new step has started when its title shows and its quiz is at stroke 1.
    await page.waitForFunction((t) => document.querySelector('.dr-title')?.textContent.startsWith(t) && /Stroke 1 of/.test(document.querySelector('.dr-status')?.textContent || ''), title, { timeout: 10000 });
    if (name) await page.screenshot({ path: shot(name) });
    const boxes = page.locator('.dr .dr-box');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await drawChar(boxes.nth(i), i === 0 ? opts : {});
  };
  await writeStep('Trace 超', {}, '13-write-it-trace.png');
  await writeStep('Trace 市');
  await writeStep('From memory', { reverseFirst: true });
  await page.getByText('Copy it once, then try again.').waitFor();
  await writeStep('Copy 超', {}, '14-write-it-copy.png');
  assert.equal(await page.locator('.dr-model').count(), 1, 'the model is beside the box');
  await writeStep('From memory');
  await writeStep('From memory');
  await writeStep('The whole word');
  await page.getByText('From memory after 2 tries').waitFor();
  await page.getByText('From memory, first try').waitFor();
  await page.getByText('The whole word from memory').waitFor();
  await page.screenshot({ path: shot('15-write-it-done.png') });
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(500);
  await page.locator('.ld-search .lists-clear').click();
  await page.waitForFunction(() => document.querySelectorAll('.ld .ent').length === 19);

  // 4d. Pick the characters: the tile that matches the pinyin shown is the right one.
  const lesson = new Map(); // dictionary pinyin -> word, from the Bài 7 fixture
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(?:>\s*)?([^|=#>\s][^|]*?)\s*\|\s*([^|]*?)\s*(?:\||$)/);
    if (m) lesson.set(m[2].split('→')[0].trim(), m[1].trim());
  }
  await page.getByText('Pick the characters').first().click();
  await page.locator('.ch').waitFor();
  await idle();
  const shownPinyin = (await page.locator('.ch .rc-pinyin').first().textContent()).split('→')[0].trim();
  const wanted = lesson.get(shownPinyin);
  assert.ok(wanted, `the pinyin ${shownPinyin} is in the lesson`);
  await page.screenshot({ path: shot('11-choose.png') });
  await page.locator('.ch-tile', { hasText: wanted }).first().click();
  await page.locator('.practice-footer[data-state="right"]').waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'End practice' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await idle();

  // 4e. Type the pinyin: letters from the keyboard, tones from the tone bar.
  const { splitPinyin } = await import('../../js/core/pinyin.js');
  const { syllableParts } = await import('../../js/core/pinyincheck.js');
  const byWord = new Map([...lesson].map(([p, w]) => [w, p]));
  await page.getByText('Type the pinyin').first().click();
  await page.locator('.py').waitFor();
  await idle();
  const typeCard = async (useBar) => {
    const word = (await page.locator('.py-word').textContent()).trim();
    const expected = byWord.get(word);
    assert.ok(expected, `${word} is in the lesson`);
    const field = page.locator('.py .field');
    await field.click();
    if (useBar) {
      const chars = [...word].filter((c) => /[一-鿿]/.test(c)).join('');
      const syllables = splitPinyin(expected, chars);
      assert.ok(syllables, `${expected} can be cut`);
      for (const s of syllables) {
        const { base, tone } = syllableParts(s);
        await page.keyboard.type(base.replace(/ü/g, 'v'));
        const names = { 1: 'first tone', 2: 'second tone', 3: 'third tone', 4: 'fourth tone', 5: 'neutral tone' };
        if (tone !== 5) await page.getByRole('button', { name: names[tone] }).click();
      }
    } else {
      await field.fill(expected);
    }
    await page.getByRole('button', { name: 'Check' }).click();
    await page.locator('.practice-footer[data-state="right"]').waitFor();
    await page.waitForTimeout(400);
  };
  await typeCard(true);
  await page.screenshot({ path: shot('12-pinyin.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  await typeCard(false);
  await page.getByRole('button', { name: 'End practice' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await idle();

  // 4c. The writing mode: draw every stroke of the first card along the data's medians.
  await page.getByText('Write the characters').first().click();
  await page.locator('.wr').waitFor();
  await idle(); // the modal has finished sliding in: positions can be measured
  await page.waitForTimeout(300);
  const boxes = page.locator('.wr .sk-box');
  const boxCount = await boxes.count();
  assert.ok(boxCount >= 1 && boxCount <= 4, `boxes: ${boxCount}`);
  await page.screenshot({ path: shot('09-write.png') });
  for (let i = 0; i < boxCount; i++) await drawChar(boxes.nth(i));
  await page.getByText(/Perfect strokes!|Done — with some help/).waitFor();
  await page.screenshot({ path: shot('10-write-done.png') });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'End practice' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await idle();

  // 4k. Fill the gap: the sentences are the list's "= " lines. A right answer, one after both
  // hints, then a wrong one (the chosen word struck through, the answer beside it).
  const card = () => page.locator('.practice-card:not(.leaving)');
  const exact = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const examples = [...text.matchAll(/^= ([^|]+?)\s*\|/gm)].map((m) => m[1].trim());
  // The chip that fills the gap: the text around the gap belongs to one of the list's sentences.
  const gapAnswer = async () => {
    const { before, after, chips } = await card().evaluate((el) => {
      const sentence = el.querySelector('.cz-sentence');
      const blank = sentence.querySelector('.cz-blank');
      let before = '';
      let after = '';
      let seen = false;
      for (const n of sentence.childNodes) {
        if (n === blank) seen = true;
        else if (seen) after += n.textContent;
        else before += n.textContent;
      }
      return { before, after, chips: [...el.querySelectorAll('.cz-bank .chip')].map((c) => c.textContent) };
    });
    const fits = examples.filter((x) => x.startsWith(before) && x.endsWith(after) && x.length > before.length + after.length).map((x) => x.slice(before.length, x.length - after.length));
    const answer = chips.find((c) => fits.includes(c));
    assert.ok(answer, `a chip fills ${before}＿${after}`);
    return answer;
  };
  const chipFor = (word) => card().locator('.cz-bank .chip', { hasText: exact(word) });
  await page.getByText('Fill the gap').first().click();
  await page.locator('.cz').waitFor();
  await idle();
  let answer = await gapAnswer();
  await chipFor(answer).click();
  assert.equal((await card().locator('.cz-blank').textContent()).trim(), answer, 'the chip drops into the gap');
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.practice-footer[data-state="right"]').waitFor();
  await card().locator('.gp-pinyin').waitFor(); // the sentence's pinyin appears after Check
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('18-fill-gap.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  answer = await gapAnswer();
  await card().getByRole('button', { name: 'Hint' }).click();
  await card().locator('.cz-callout').waitFor();
  await page.waitForTimeout(400); // a double tap on Hint uses only one hint
  await card().getByRole('button', { name: 'Another hint' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.practice-card:not(.leaving) .cz-bank .chip.dim').length >= 1);
  assert.equal(await chipFor(answer).isDisabled(), false, 'the answer never fades');
  await chipFor(answer).click();
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.practice-footer[data-state="right"]').waitFor();
  assert.equal(await page.locator('.pf-title').textContent(), 'Correct — with a hint');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  answer = await gapAnswer();
  const wrongWord = (await card().locator('.cz-bank .chip').allTextContents()).find((w) => w !== answer);
  await chipFor(wrongWord).click();
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.practice-footer[data-state="wrong"]').waitFor();
  assert.equal(await card().locator('.cz-was').textContent(), wrongWord, 'the wrong choice is struck through');
  assert.equal(await card().locator('.cz-ans').textContent(), answer);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('19-fill-gap-wrong.png') });
  await page.getByRole('button', { name: 'End practice' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await idle();

  // 4l. Match the meanings: 10 words on two boards of 5. A wrong pair first (it counts against
  // the word tapped first), then every pair; the missed word comes back on a board of 4.
  const meaningOf = new Map(); // word -> meaning, from the Bài 7 fixture
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^|=#>\s][^|]*?)\s*\|\s*[^|]*?\s*\|\s*(.+)$/);
    if (m) meaningOf.set(m[1].trim(), m[2].trim());
  }
  const playBoard = async ({ mistake = false } = {}) => {
    const board = card().locator('.mt-board');
    const words = (await board.locator('.mt-zh').allTextContents()).map((w) => w.trim());
    if (mistake) {
      const wrong = (await board.locator('.mt-en').allTextContents()).find((m) => m !== meaningOf.get(words[0]));
      await board.locator('.mt-zh').nth(0).click();
      await board.locator('.mt-en', { hasText: exact(wrong) }).click();
      await board.locator('.mt-cell.wrong').first().waitFor();
      await page.screenshot({ path: shot('20-match-wrong-pair.png') });
    }
    for (let i = 0; i < words.length; i++) {
      await board.locator('.mt-zh').nth(i).click();
      await board.locator('.mt-en', { hasText: exact(meaningOf.get(words[i])) }).click();
    }
    return words;
  };
  await page.getByText('Match the meanings').first().click();
  await page.locator('.mt').waitFor();
  await idle();
  assert.equal(await page.locator('.pt-count').textContent(), '0/2', 'the header counts boards');
  const firstBoard = await playBoard({ mistake: true });
  assert.equal(firstBoard.length, 5);
  await page.locator('.practice-footer[data-state="close"]').waitFor();
  assert.equal(await page.locator('.pf-title').textContent(), `Missed: ${firstBoard[0]}`);
  await card().locator('.mt-board.sorted').waitFor();
  await page.waitForTimeout(600); // the meanings slide beside their words
  const order = await card().locator('.mt-board .mt-cell').evaluateAll((els) => els.map((x) => x.dataset.id));
  for (let i = 0; i < order.length; i += 2) assert.equal(order[i], order[i + 1], 'each meaning beside its word');
  assert.equal(await card().locator('.mt-zh.missed').count(), 1);
  assert.equal(await card().locator('.mt-say').count(), 5, 'a speaker on every row');
  await page.screenshot({ path: shot('21-match-sorted.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  assert.equal((await playBoard()).length, 5);
  await page.locator('.practice-footer[data-state="right"]').waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(600);
  await card().locator('.retry-tag').waitFor();
  const retryWords = await playBoard();
  assert.equal(retryWords.length, 4, 'the missed word, topped up to 4');
  assert.ok(retryWords.includes(firstBoard[0]));
  await page.locator('.practice-footer[data-state="right"]').waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('90%').waitFor(); // 9 of the 10 words right the first time
  await page.screenshot({ path: shot('22-match-results.png') });
  await page.getByRole('button', { name: 'Done' }).click();
  await idle();
  await page.locator('.nav-back').first().click();
  await idle();
  await page.getByText('2 lists').waitFor();

  // 4f. Settings: the pronunciation section exists and the voice sheet opens without voices.
  await page.locator('.screen:not(.covered) .tabbar').getByText('Settings').click();
  await idle();
  await page.getByText('Pronunciation').waitFor();
  await page.getByText('Tones must be right').waitFor();
  await page.getByText('Test voice').click();
  await page.locator('.row', { hasText: 'Voice' }).first().click();
  await page.getByText('Automatic').waitFor();
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(400);
  await page.locator('.screen:not(.covered) .tabbar').getByText('Lists').click();
  await idle();

  // 4i. The Lists search finds words in every list (超 is chāo exactly, 超市 starts with it), and
  // a word opens its word page.
  await page.locator('.lists-search-input').fill('chao');
  await page.locator('.lists-words .ent').first().waitFor();
  assert.deepEqual(await page.locator('.lists-words .ent-zh').allTextContents(), ['超', '超市']);
  // 超市 is also an HSK 1 word: its row says so, and the HSK section does not show it again.
  assert.match(await page.locator('.lists-words .lists-word-in').nth(1).textContent(), /HSK 1$/);
  assert.equal(await page.locator('.lists-hsk').isHidden(), true, 'no other HSK 1-3 word reads chao');
  await page.screenshot({ path: shot('16-lists-search.png') });
  await page.locator('.lists-words .ent').nth(1).click();
  await page.locator('.wd-sheet .wd-box[data-char="市"]').waitFor();
  // Its page: the list's own sentence, then the HSK sentences (without the list's one).
  assert.equal(await page.locator('.wd-sheet .wd-hsk .rc-block-label').textContent(), 'More examples · HSK 1');
  assert.ok((await page.locator('.wd-sheet .wd-hsk .wd-ex').count()) >= 2);
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(500);

  // 4j. Words of the HSK 1-3 dictionary that are in no list (水 and 睡觉 read shui); the page of
  // 水 has its three sentences, each with a speaker, and no progress.
  await page.locator('.lists-search-input').fill('shui');
  await page.locator('.lists-hsk .ent').first().waitFor();
  const hskWords = await page.locator('.lists-hsk .ent-zh').allTextContents();
  assert.ok(hskWords.includes('水') && hskWords.includes('睡觉'), hskWords.join(' '));
  assert.equal(await page.locator('.lists-words').isHidden(), true, 'no list has a word read shui');
  await page.locator('.lists-hsk .ent').filter({ has: page.locator('.ent-zh', { hasText: /^水$/ }) }).click();
  await page.locator('.wd-sheet .wd-hsk .wd-ex').nth(2).waitFor();
  assert.equal(await page.locator('.wd-sheet .wd-hsk .wd-ex').count(), 3);
  assert.equal(await page.locator('.wd-sheet .wd-hsk .rc-example-say').count(), 3);
  assert.equal(await page.locator('.wd-sheet .ent-status').count(), 0, 'an HSK word has no progress');
  await page.waitForTimeout(500); // the sheet has slid in
  await page.locator('.wd-sheet .wd-hsk').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('17-hsk-word.png') });
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(500);
  await page.locator('.lists-clear').click();

  // 5. Manifest id, service worker cache prefix, other apps' caches, offline.
  const manifest = await (await fetch(`${BASE}manifest.webmanifest`)).json();
  assert.equal(new URL(manifest.id, BASE).pathname, PATH, 'manifest id resolves to the repository path');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('chinese-practice-1-')), null, { timeout: 15000 });
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.every((k) => k.startsWith('chinese-practice-1-')), `only this app's caches were made: ${keys.join(', ')}`);
  // Other apps' caches (and an old cache of this app) exist; after a fresh activation only the old one of this app is gone.
  await page.evaluate(async () => {
    await (await caches.open('otherapp-v1')).put('/x', new Response('x'));
    await (await caches.open('hanzigrid-v1')).put('/x', new Response('x'));
    await (await caches.open('chinese-practice-1-old')).put('/x', new Response('x'));
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.unregister();
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.waitForFunction(async () => !(await caches.keys()).includes('chinese-practice-1-old'), null, { timeout: 15000 });
  const after = await page.evaluate(() => caches.keys());
  assert.ok(after.includes('otherapp-v1') && after.includes('hanzigrid-v1'), `other caches untouched: ${after.join(', ')}`);
  assert.ok(!after.includes('chinese-practice-1-old'), 'the old cache of this app is deleted');
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('chinese-practice-1-') && k !== 'chinese-practice-1-old');
    const cache = await caches.open(name);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  for (const f of ['fonts/ukai-cn.ttf', 'fonts/noto-sans-sc.ttf', 'data/common3500.txt', 'js/app.js', 'css/app.css']) {
    assert.ok(cached.includes(PATH + f), `${f} is precached`);
  }
  // Offline: the app still opens, with the lists.
  await context.setOffline(true);
  await page.reload();
  await page.locator('.screen:not(.covered) .tabbar').waitFor();
  await idle();
  await page.screenshot({ path: shot('07-offline.png') });
  await page.locator('.screen:not(.covered) .tabbar').getByText('Lists').click();
  await page.getByText('2 lists').waitFor();
  const fontOk = await page.evaluate(async () => (await document.fonts.load('30px "Hanzi Kai"')).length > 0);
  assert.equal(fontOk, true, 'the KaiTi font is available offline');
  await context.setOffline(false);
  await page.evaluate(async () => {
    for (const k of ['otherapp-v1', 'hanzigrid-v1']) await caches.delete(k);
  });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('e2e: all flows passed; screenshots in tests/output/');
} finally {
  if (browser) await browser.close();
  server.kill();
}
