// The word page: a sheet that shows how to write a word straight away. Its characters are drawn
// stroke by stroke in 田字格 boxes, one after the other; tapping a box draws that character
// again and shows its numbered stroke diagram. Under it: Write it, then the pinyin, meaning,
// example sentence, the characters listed under the word and the progress. "Write it" turns the
// same sheet into the writing practice (ui/drill.js).
// Opened from a list's rows, the Lists search, the pencil on a recall card, the results screen
// and the writing mode.
import { h } from './dom.js';
import { button, sheet } from './components.js';
import { speak } from './speech.js';
import { gridBox, borrowWriter, diagramRow, rowBoxSize } from './strokes.js';
import { drillView } from './drill.js';
import * as store from '../data/store.js';
import { strokeData } from '../data/strokes.js';
import { charSets } from '../data/chars.js';
import { chineseChars, isSentence } from '../core/extract.js';
import { pinyinLabel, charWarnings } from '../core/lists.js';
import { WRITE_MAX_CHARS } from '../core/strokes.js';
import { isDue, boxLabel } from '../core/srs.js';
import { startOfDay, DAY } from '../core/util.js';
import { exampleNode, partsNode, pinyinNode } from '../screens/practice/recall.js';

function say(text) {
  const s = store.settings();
  speak(text, { rate: s.speechRate, voiceURI: s.voiceURI });
}

// "today" | "tomorrow" | "in 3 days"
function whenText(due, now) {
  if (due <= now) return 'today';
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// An entry's progress line: { text, due }, or null when it has never been practised.
export function statusOf(p, now = Date.now()) {
  if (!p || !p.seen) return null;
  if (isDue(p, now)) return { text: `${boxLabel(p.box)} · due for review`, due: true };
  return { text: `${boxLabel(p.box)} · next review ${whenText(p.due, now)}`, due: false };
}

// Characters that deserve a look: missing from the app's fonts (red) or not common (orange).
export function warningOf(entry, sets) {
  const w = charWarnings(entry.word, sets);
  if (w.missing.length) return { text: `Not in the app's fonts (a traditional or rare character?): ${w.missing.join(' ')}`, red: true };
  if (w.rare.length) return { text: `Unusual character, check it: ${w.rare.join(' ')}`, red: false };
  return null;
}

// A word page is being prepared: a second tap meanwhile does nothing. Once its sheet is up, the
// sheet itself covers the page (and lets taps through again as soon as it starts closing).
let opening = false;

// entry: the word; entries: its list's entries (for the characters listed under it); progress:
// its progress record when the caller has it (else it is read here); drill: open straight into
// "Write it". Resolves with the sheet, or null.
export async function showWord(entry, { entries = [], progress, drill = false } = {}) {
  if (!entry || opening) return null;
  opening = true;
  try {
    return await open(entry, { entries, progress, drill });
  } finally {
    opening = false;
  }
}

async function open(entry, { entries, progress, drill }) {
  const chars = [...chineseChars(entry.word || '')];
  const [datas, sets, p] = await Promise.all([
    Promise.all(chars.map((ch) => strokeData(ch))),
    charSets(),
    progress !== undefined ? progress : store.getProgress([entry.id]).then((m) => m.get(entry.id) || null, () => null),
  ]);
  const settings = store.settings();
  const writable = chars.length > 0 && chars.length <= WRITE_MAX_CHARS && datas.every(Boolean);

  const host = h('div', { class: 'wd' });
  let closed = false;
  let drillNow = null;
  const s = sheet({
    title: pinyinLabel(entry) || entry.word,
    content: host,
    className: 'wd-sheet',
    // Runs once the sheet has slid away, so the writers can go back to the pool unseen.
    onClose: () => {
      closed = true;
      if (drillNow) drillNow.destroy();
      releaseAll();
    },
  });
  // The room inside the sheet (its body has a 16 px gutter on each side).
  const width = Math.max(240, Math.min(s.body.clientWidth || innerWidth, 640) - 32);

  /* ---------- how to write it: the boxes, the diagram, the controls ---------- */

  const items = chars.map((ch, i) => ({ ch, data: datas[i], index: i }));
  const drawable = items.filter((it) => it.data);
  const size = rowBoxSize(chars.length, width);
  let selected = null;
  let slow = false;
  let run = 0; // the "draw the word" sequence running now; a newer one (or a tap) stops it
  let nextStroke = 0;

  const charTitle = h('div', { class: 'wd-char-title' });
  const diagramHost = h('div', { class: 'wd-diagram' });
  const boxEls = items.map((it) => {
    if (!it.data) {
      return h('div', { class: 'wd-box wd-nodata kai', lang: 'zh', style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.62)}px` }, title: 'No stroke data for this character' }, it.ch);
    }
    it.box = gridBox(size, { className: 'wd-box' });
    const el = it.box.el;
    el.dataset.char = it.ch;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', `${it.ch}, ${it.data.strokes.length} strokes: draw it again`);
    el.addEventListener('click', () => pick(it));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(it);
      }
    });
    return el;
  });

  function makeWriters() {
    for (const it of drawable) {
      it.lease = borrowWriter(it.box, it.ch, it.data, { size, outline: true, speed: slow ? 0.35 : 1, delay: slow ? 700 : 450 });
      it.writer = it.lease.writer;
    }
  }

  function releaseAll() {
    run += 1;
    for (const it of drawable) it.lease?.release();
  }

  function stopAll() {
    run += 1;
    for (const it of drawable) {
      try {
        it.writer?.pauseAnimation();
      } catch {
        /* nothing running */
      }
    }
  }

  // Draws the characters one after the other, from empty boxes.
  async function playAll() {
    const mine = ++run;
    nextStroke = 0;
    await Promise.all(drawable.map((it) => it.writer.hideCharacter({ duration: 0 })));
    for (const it of drawable) {
      if (mine !== run || closed) return;
      await it.writer.animateCharacter();
    }
  }

  function select(it) {
    selected = it;
    nextStroke = 0;
    for (const x of drawable) x.box.el.classList.toggle('wd-selected', drawable.length > 1 && x === it);
    const n = it.data.strokes.length;
    charTitle.replaceChildren(h('span', { class: 'kai', lang: 'zh' }, it.ch), ` · ${n} ${n === 1 ? 'stroke' : 'strokes'}`);
    diagramHost.replaceChildren(diagramRow(it.data));
  }

  // A tap on a box: that character is drawn again and its diagram shown.
  function pick(it) {
    run += 1; // the word's sequence stops after the character it is drawing
    select(it);
    it.writer.animateCharacter();
  }

  // One stroke per tap of the chosen character, from the start again after the last one.
  async function oneStroke() {
    if (!selected) return;
    run += 1;
    const total = selected.data.strokes.length;
    if (nextStroke >= total || nextStroke === 0) {
      await selected.writer.hideCharacter({ duration: 0 });
      nextStroke = 0;
    }
    selected.writer.animateStroke(nextStroke);
    nextStroke += 1;
  }

  const slowBtn = button({
    label: 'Slower',
    icon: 'clock',
    variant: 'plain',
    onTap: () => {
      slow = !slow;
      slowBtn.querySelector('span').textContent = slow ? 'Normal speed' : 'Slower';
      releaseAll();
      makeWriters();
      playAll();
    },
  });
  const controls = drawable.length
    ? h(
        'div',
        { class: 'wd-controls' },
        button({ label: 'Play again', icon: 'play', variant: 'tinted', onTap: () => playAll() }),
        button({ label: 'One stroke', icon: 'arrowRight', variant: 'tinted', onTap: () => oneStroke() }),
        slowBtn,
        button({ label: 'Hear it', icon: 'speaker', variant: 'plain', onTap: () => say(entry.word) }),
      )
    : h('div', { class: 'wd-controls' }, button({ label: 'Hear it', icon: 'speaker', variant: 'plain', onTap: () => say(entry.word) }));

  /* ---------- the details (what the entry sheet showed) ---------- */

  const status = statusOf(p);
  const warning = warningOf(entry, sets);
  const wordEl = h(
    'div',
    { class: 'wd-word' },
    h('div', { class: 'wd-boxes' }, boxEls),
    settings.showPrint && !isSentence(entry.word) ? h('div', { class: 'wd-print print', lang: 'zh' }, entry.word) : null,
    drawable.length ? h('div', { class: 'wd-char' }, charTitle, diagramHost) : h('p', { class: 'wd-note' }, 'No stroke data for these characters.'),
    controls,
    writable ? button({ label: 'Write it', icon: 'pencil', size: 'large', block: true, className: 'wd-write', onTap: () => openDrill() }) : null,
    drawable.length ? h('p', { class: 'sk-note' }, 'Mainland China stroke order. Your textbook has the last word.') : null,
    h('div', { class: 'rc-row' }, pinyinNode(entry, 'rc-pinyin'), entry.meaning ? h('div', { class: 'rc-meaning' }, entry.meaning) : null),
    entry.unsure ? h('div', { class: 'rc-unsure' }, 'The AI was not sure about this line: check it.') : null,
    warning ? h('div', { class: ['ent-warn', warning.red && 'red'] }, warning.text) : null,
    exampleNode(entry, { speak: say }),
    partsNode(entry, entries),
    h('div', { class: 'rc-block' }, h('div', { class: 'rc-block-label' }, 'Progress'), h('div', { class: ['ent-status', status?.due && 'due'] }, status ? status.text : 'New · not practised yet')),
  );

  /* ---------- Write it ---------- */

  function openDrill() {
    stopAll();
    drillNow = drillView({ entry, entries, chars, datas, width, speak: say, onBack: () => showWordView() });
    host.replaceChildren(drillNow.el);
    s.body.scrollTop = 0;
  }

  // Back from Write it: the word is drawn again (it was stopped half-way, or never drawn when the
  // page opened straight into Write it).
  function showWordView() {
    if (drillNow) drillNow.destroy();
    drillNow = null;
    host.replaceChildren(wordEl);
    s.body.scrollTop = 0;
    if (drawable.length) playAll();
  }

  host.replaceChildren(wordEl);
  if (drawable.length) {
    makeWriters();
    select(drawable[0]);
  }
  if (drill && writable) openDrill();
  else if (drawable.length) playAll();
  return s;
}
