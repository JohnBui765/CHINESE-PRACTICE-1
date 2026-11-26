// Match the meanings: a board of up to 7 entries, the Chinese on the left (lesson order, no
// pinyin) and the meanings shuffled on the right. Tap an item in one column, then one in the
// other. A right pair turns green and stays where it is (the board never jumps); a wrong pair
// shakes red and counts as a miss for the item tapped first. The last match grades the board,
// each entry on its own (session.js); then the meanings slide beside their words, the pinyin
// appears, the missed rows turn orange, and each row gets a speaker. A tap then opens the word page.
import { h, reducedMotion, replaceChildren } from '../../ui/dom.js';
import { showWord } from '../../ui/word.js';
import { chineseChars } from '../../core/extract.js';
import { pinyinLabel } from '../../core/lists.js';
import { isPair } from '../../core/match.js';
import { shuffle } from '../../core/util.js';
import { MAX_RETRIES } from './session.js';
import { sayButton } from './recall.js';

const SHAKE_MS = 400;
const SORT_AFTER_MS = 350; // the last green pair shows for a moment before the board is sorted
const SHAKE = [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }));

// Smaller characters for longer words, so up to 6 fit in half the width of an iPhone.
function zhSize(word) {
  const n = [...String(word || '')].length;
  return n <= 2 ? '' : n <= 4 ? 'long' : 'sentence';
}

const pairsLabel = (n) => (n === 1 ? '1 pair left' : `${n} pairs left`);

export function render(card, ctx) {
  const items = ctx.items || [];
  const rng = ctx.rng || Math.random;
  const settings = ctx.settings || {};
  const say = (entry) => chineseChars(entry.word || '') || entry.word;

  // The meanings in a random order, never the very order of the words.
  let meanings = shuffle(items, rng);
  for (let i = 0; i < 6 && items.length > 1 && meanings.every((e, k) => e === items[k]); i++) meanings = shuffle(items, rng);

  const missed = new Set(); // entry ids: the item tapped first in a wrong pair
  const matched = new Set(); // cells
  const shakes = new Map(); // cell -> timer
  let selected = null; // { side, entry, el }
  let pairsLeft = items.length;
  let result = null;
  let sortTimer = 0;

  function cell(side, entry) {
    const zh = side === 'zh';
    const el = h(
      'button',
      {
        type: 'button',
        class: ['mt-cell', zh ? 'mt-zh' : 'mt-en'],
        dataset: { id: entry.id },
        'aria-pressed': 'false',
        onClick: () => tap(side, entry, el),
      },
      zh ? h('span', { class: ['mt-word', 'kai', zhSize(entry.word)], lang: 'zh' }, entry.word) : entry.meaning,
    );
    return el;
  }

  const zhCells = items.map((e) => cell('zh', e));
  const enCells = new Map(meanings.map((e) => [e.id, cell('en', e)]));
  const boardEl = h('div', { class: 'mt-board' }, items.map((e, i) => [zhCells[i], enCells.get(meanings[i].id)]));
  const help = h('div', { class: 'mt-help' }, 'Tap a word, then its meaning');
  const el = h('div', { class: 'mt' }, h('div', { class: 'rc-front-label' }, 'Match the meanings'), help, boardEl);

  function select(side, entry, cellEl) {
    if (selected) {
      selected.el.classList.remove('selected');
      selected.el.setAttribute('aria-pressed', 'false');
    }
    selected = side ? { side, entry, el: cellEl } : null;
    if (selected) {
      cellEl.classList.add('selected');
      cellEl.setAttribute('aria-pressed', 'true');
    }
  }

  function shake(cellEl) {
    clearTimeout(shakes.get(cellEl));
    cellEl.classList.add('wrong');
    if (!reducedMotion()) cellEl.animate(SHAKE, { duration: SHAKE_MS, easing: 'ease-in-out' });
    shakes.set(
      cellEl,
      setTimeout(() => {
        cellEl.classList.remove('wrong');
        shakes.delete(cellEl);
      }, SHAKE_MS),
    );
  }

  function tap(side, entry, cellEl) {
    // Once the board is done, a tap opens the word page (how to write it).
    if (result) return showWord(entry, { entries: ctx.list.entries });
    if (matched.has(cellEl)) return;
    if (!selected) return select(side, entry, cellEl);
    if (selected.el === cellEl) return select(null);
    if (selected.side === side) return select(side, entry, cellEl);
    const first = selected;
    select(null);
    const zh = side === 'zh' ? entry : first.entry;
    const en = side === 'zh' ? first.entry : entry;
    if (!isPair(zh, en)) {
      missed.add(first.entry.id);
      shake(first.el);
      shake(cellEl);
      return;
    }
    for (const c of [first.el, cellEl]) {
      c.classList.add('matched');
      c.setAttribute('aria-disabled', 'true');
      matched.add(c);
    }
    // Inside the tap, so iOS allows the speech.
    if (settings.autoSpeak && ctx.speak) ctx.speak(say(zh));
    pairsLeft -= 1;
    if (pairsLeft > 0) ctx.setPrimaryLabel(pairsLabel(pairsLeft));
    else finish();
  }

  // Grades the board: every entry right unless it was the first-tapped item of a wrong pair.
  function finish() {
    const names = items.filter((e) => missed.has(e.id)).map((e) => e.word);
    const again = names.length > 0 && (card.retry || 0) < MAX_RETRIES;
    result = {
      correct: names.length === 0,
      close: names.length > 0,
      items: items.map((e) => ({ itemId: e.id, correct: !missed.has(e.id) })),
      noAutoAdvance: true, // the sorted board is worth a look
      feedback: names.length
        ? { title: `Missed: ${names.join(', ')}`, detail: again ? (names.length === 1 ? 'It comes back at the end.' : 'They come back at the end.') : '', icon: again ? 'refresh' : 'xCircle' }
        : { detail: 'Every pair right the first time.' },
    };
    sortTimer = setTimeout(sortBoard, SORT_AFTER_MS);
    ctx.setPrimaryLabel('Check');
    ctx.setReady(true);
    ctx.submit();
  }

  // Each meaning slides beside its word (each cell glides from where it was), the pinyin appears
  // under each word, the missed rows turn orange and each row gets a speaker.
  function sortBoard() {
    const cells = [...boardEl.querySelectorAll('.mt-cell')];
    const before = new Map(cells.map((c) => [c, c.getBoundingClientRect()]));
    items.forEach((e, i) => {
      const py = pinyinLabel(e);
      if (py) zhCells[i].append(h('span', { class: 'mt-py', lang: 'zh-Latn' }, py));
      zhCells[i].classList.toggle('missed', missed.has(e.id));
      enCells.get(e.id).classList.toggle('missed', missed.has(e.id));
    });
    boardEl.classList.add('sorted');
    replaceChildren(boardEl, items.map((e, i) => [zhCells[i], enCells.get(e.id), sayButton(say(e), ctx.speak, { className: 'mt-say' })]));
    help.textContent = 'Tap a word to see how to write it';
    if (reducedMotion()) return;
    for (const c of cells) {
      const a = before.get(c);
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  }

  return {
    el,
    primaryLabel: pairsLabel(items.length),
    readyInitially: false,
    check() {
      return result;
    },
    destroy() {
      clearTimeout(sortTimer);
      for (const t of shakes.values()) clearTimeout(t);
    },
  };
}
