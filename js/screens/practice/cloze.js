// Fill the gap: a sentence of the list with one word blanked, its English under it, and a word
// bank of words from the same lesson. Tap a chip and it drops into the gap; tap it (or the gap)
// again to take it back; then Check. Adapted from Vocab Studio's "In context" mode (its
// js/screens/practice/cloze.js): the word bank only (the iPhone's Chinese keyboard would suggest
// the answer), a gap of one width whatever the answer, the sentence's pinyin only after Check (a
// pinyin line with a gap in it cannot always be cut right). The sentence, the gap and the bank
// come from the card (core/gaps.js). Styles: css/screens/mode-cloze.css (Vocab Studio's,
// unchanged) and the Chinese parts in hanzi.css.
import { h, reducedMotion } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, iconButton, chip } from '../../ui/components.js';
import { showWord } from '../../ui/word.js';
import { chineseChars } from '../../core/extract.js';
import { pinyinLabel } from '../../core/lists.js';
import { gapOnCard } from '../../core/gaps.js';
import { shuffle } from '../../core/util.js';
import { sayButton } from './recall.js';

const HINT_GAP = 350; // ms: a double tap on Hint uses one hint, not two
const EMPTY = '​'; // keeps a text baseline inside the empty gap
const GAP_WIDTH = '2.4em'; // every gap is this wide, so it never tells how many characters are missing

// Measures `nodes`, runs `mutate`, then slides each node from where it was (FLIP) so content
// below a change glides instead of jumping.
function flip(nodes, mutate) {
  // Only nodes rendered before the change (a hidden node has no box to slide from).
  const live = nodes.filter((n) => n && n.isConnected && n.getClientRects().length);
  if (reducedMotion() || !live.length) return mutate();
  const before = live.map((n) => n.getBoundingClientRect().top);
  mutate();
  live.forEach((n, i) => {
    if (!n.isConnected) return;
    const dy = before[i] - n.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    n.animate([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  });
}

const wordOf = (entry) => chineseChars(entry?.word || '');

export function render(card, ctx) {
  const { list, settings = {} } = ctx;
  const rng = ctx.rng || Math.random;
  const gap = gapOnCard(list.entries, card); // practice.js only shows cards whose gap resolves
  const answer = gap.answer;
  const pinyin = pinyinLabel(answer);

  let checked = false;
  let chosen = null; // the entry in the gap

  /* ---------- sentence + gap ---------- */

  const blank = h(
    'button',
    {
      type: 'button',
      class: 'cz-blank',
      style: { '--cz-w': GAP_WIDTH },
      'aria-label': 'Gap. Choose a word below.',
      onClick: () => {
        if (!checked && chosen) select(null);
      },
    },
    EMPTY,
  );
  const sentenceEl = h('p', { class: 'cz-sentence kai', lang: 'zh' }, gap.before, blank, gap.after);
  // The English from the start: when two words fit the gap (我去买＿＿。), it says which one.
  const englishEl = gap.english ? h('p', { class: 'gp-english' }, gap.english) : null;

  function showChosen(word) {
    blank.classList.toggle('filled', !!word);
    if (word) {
      blank.replaceChildren(h('span', { class: 'cz-fill' }, word));
      blank.setAttribute('aria-label', `Gap: ${word}. Tap to take it back.`);
    } else {
      blank.replaceChildren(EMPTY);
      blank.setAttribute('aria-label', 'Gap. Choose a word below.');
    }
  }

  function showResult(correct, given) {
    blank.classList.remove('filled');
    blank.classList.add(correct ? 'is-right' : 'is-wrong');
    blank.setAttribute('aria-disabled', 'true');
    const ans = h('span', { class: 'cz-fill cz-ans' }, gap.gap);
    if (correct) {
      blank.replaceChildren(ans);
      blank.setAttribute('aria-label', `Answer: ${gap.gap}`);
    } else {
      blank.replaceChildren(h('s', { class: 'cz-was' }, given), ' ', ans);
      blank.setAttribute('aria-label', `Your answer: ${given}. Answer: ${gap.gap}`);
    }
  }

  /* ---------- word bank ---------- */

  const chips = new Map(); // entry -> chip element
  for (const entry of gap.options) {
    const el = chip({
      label: wordOf(entry),
      className: 'kai',
      onTap: (e) => {
        onChip(entry);
        // A tapped chip keeps focus in desktop browsers, so Enter would toggle it off instead of
        // checking. Keyboard users (detail 0) keep focus on it.
        if (e.detail > 0) el.blur();
      },
    });
    el.setAttribute('lang', 'zh');
    el.setAttribute('aria-pressed', 'false');
    chips.set(entry, el);
  }
  const bank = h('div', { class: 'cz-bank', role: 'group', 'aria-label': 'Word bank' }, [...chips.values()]);

  function select(entry) {
    if (chosen) {
      const prev = chips.get(chosen);
      prev.classList.remove('selected');
      prev.setAttribute('aria-pressed', 'false');
    }
    chosen = entry;
    if (entry) {
      const el = chips.get(entry);
      el.classList.add('selected');
      el.setAttribute('aria-pressed', 'true');
    }
    showChosen(entry ? wordOf(entry) : '');
    ctx.setReady(!!entry);
  }

  function onChip(entry) {
    if (checked || chips.get(entry).disabled) return;
    select(chosen === entry ? null : entry);
  }

  /* ---------- hints: the missing word's pinyin and meaning, then half the wrong chips fade ---------- */

  const hintText = h('div', { class: 'cz-callout-text' });
  const callout = h('div', { class: 'cz-callout', hidden: true, role: 'status' }, icon('lightbulb', { size: 18 }), hintText);

  const steps = [];
  if (pinyin || answer.meaning) {
    steps.push(() => {
      hintText.append(h('p', null, pinyin ? h('span', { class: 'gp-hint-py', lang: 'zh-Latn' }, pinyin) : null, pinyin && answer.meaning ? ' · ' : null, answer.meaning || null));
      callout.hidden = false;
    });
  }
  const wrong = gap.options.filter((e) => e !== answer);
  if (wrong.length >= 2) {
    steps.push(() => {
      for (const entry of shuffle(wrong, rng).slice(0, Math.floor(wrong.length / 2))) {
        if (chosen === entry) select(null);
        const el = chips.get(entry);
        el.classList.add('dim');
        el.disabled = true;
      }
    });
  }
  let hints = 0;
  let lastHintAt = -Infinity;

  const hintBtn = button({ label: 'Hint', icon: 'lightbulb', variant: 'tinted', size: 'small', className: 'cz-hint-btn', onTap: onHint });
  const hintArea = h('div', { class: 'cz-hints' }, hintBtn, callout);
  if (!steps.length) hintArea.hidden = true;

  function onHint() {
    if (checked || hints >= steps.length) return;
    if (performance.now() - lastHintAt < HINT_GAP) return;
    lastHintAt = performance.now();
    flip([callout, bank], () => {
      steps[hints]();
      hints += 1;
      if (hints >= steps.length) hintBtn.hidden = true;
      else hintBtn.querySelector('span').textContent = 'Another hint';
    });
  }

  /* ---------- after Check: the sentence's pinyin, then the word ---------- */

  function buildReveal() {
    return h(
      'div',
      { class: 'cz-reveal' },
      h(
        'div',
        { class: 'cz-word' },
        h('span', { class: 'cz-word-main' }, h('span', { class: 'cz-word-text kai', lang: 'zh' }, answer.word), pinyin ? h('span', { class: 'gp-word-py', lang: 'zh-Latn' }, pinyin) : null),
        sayButton(wordOf(answer) || answer.word, ctx.speak, { className: 'cz-speak', variant: 'filled' }),
        iconButton({ icon: 'pencil', label: 'How to write it', variant: 'filled', className: 'gp-strokes', onTap: () => showWord(answer, { entries: list.entries }) }),
      ),
      answer.meaning ? h('p', { class: 'cz-sense' }, answer.meaning) : null,
    );
  }

  /* ---------- layout ---------- */

  const head = h('div', { class: 'cz-head' }, h('span', { class: 'cz-caption' }, 'Fill the gap'));
  const cardEl = h('div', { class: 'card cz-card' }, head, sentenceEl, englishEl, hintArea);
  const el = h('div', { class: 'cz cz-bank-mode' }, cardEl, bank);

  /* ---------- check ---------- */

  function check() {
    if (checked || !chosen) return null;
    checked = true;
    const given = wordOf(chosen);
    const correct = given === gap.gap;
    // Speech must start inside the tap that called check() (iOS).
    if (settings.autoSpeak && ctx.speak) ctx.speak(gap.text);

    showResult(correct, given);
    for (const [entry, chipEl] of chips) {
      chipEl.disabled = true;
      chipEl.classList.remove('selected');
      if (entry === answer) chipEl.classList.add('right');
      else if (entry === chosen) chipEl.classList.add('wrong');
    }
    const pinyinEl = gap.pinyin ? h('p', { class: 'gp-pinyin', lang: 'zh-Latn' }, gap.pinyin) : null;
    const reveal = buildReveal();
    flip([englishEl, bank], () => {
      if (pinyinEl) sentenceEl.after(pinyinEl);
      hintArea.replaceWith(reveal);
      head.append(sayButton(gap.text, ctx.speak, { className: 'gp-say' }));
    });
    return { correct, hinted: correct && hints > 0, feedback: { detail: [gap.gap, pinyin, answer.meaning].filter(Boolean).join(' · ') } };
  }

  return {
    el,
    primaryLabel: 'Check',
    readyInitially: false,
    focus() {
      // No keyboard needed (a typed card before this one may have left it up).
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
    },
    check,
  };
}
