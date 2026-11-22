// Recall cards, graded by the learner. Direction "word": the front shows the characters (KaiTi,
// with the print form under it); the back adds pinyin, meaning, the example sentence and the
// characters listed under the word. Direction "meaning": the front shows pinyin and meaning, the
// learner recalls (or writes on paper) the characters, and the back shows them.
import { h, reducedMotion } from '../../ui/dom.js';
import { iconButton } from '../../ui/components.js';
import { showWord } from '../../ui/word.js';
import { partsOf, pinyinLabel, exampleUnderline } from '../../core/lists.js';

const FLIP_MS = 450;
const FADE_MS = 200;
const FLIP_EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';

// Bigger characters for short words, smaller for sentences.
export function sizeClass(word) {
  const n = [...String(word || '')].length;
  if (n <= 2) return 'rc-len-1';
  if (n <= 4) return 'rc-len-2';
  if (n <= 8) return 'rc-len-3';
  return 'rc-len-4';
}

// "nǐ → ní": the dictionary pinyin, then the pinyin as said in the word, in the accent colour.
export function pinyinNode(entry, className) {
  const pinyin = String(entry.pinyin || '').trim();
  const said = String(entry.said || '').trim();
  if (!pinyin && !said) return null;
  const kids = [pinyin || said];
  if (pinyin && said && said !== pinyin) kids.push(' → ', h('span', { class: 'rc-said' }, said));
  return h('div', { class: className, lang: 'zh-Latn' }, kids);
}

// A speaker button that does not disturb what it sits on (a card that flips, a row).
export function sayButton(text, speak, { className = '', variant = '' } = {}) {
  if (!speak) return null;
  return iconButton({
    icon: 'speaker',
    label: `Say ${text}`,
    variant,
    className,
    onTap: (e) => {
      e.stopPropagation();
      speak(text);
    },
  });
}

// The example sentence in KaiTi with the word underlined, then its pinyin and English.
// `speak` (optional) adds a speaker for the sentence.
export function exampleNode(entry, { speak = null } = {}) {
  if (!entry.example) return null;
  const text = String(entry.example);
  const ul = exampleUnderline(entry);
  const zh = ul ? [text.slice(0, ul.start), h('span', { class: 'rc-ul' }, text.slice(ul.start, ul.end)), text.slice(ul.end)] : [text];
  return h(
    'div',
    { class: 'rc-block' },
    h('div', { class: 'rc-block-label' }, 'Example', sayButton(text, speak, { className: 'rc-example-say' })),
    h('div', { class: 'rc-example-zh kai', lang: 'zh' }, zh),
    entry.examplePinyin ? h('div', { class: 'rc-example-py', lang: 'zh-Latn' }, entry.examplePinyin) : null,
    entry.exampleMeaning ? h('div', { class: 'rc-example-en' }, entry.exampleMeaning) : null,
  );
}

// The characters (or chunks) listed under the entry, as small tiles.
export function partsNode(entry, entries) {
  const parts = partsOf(entries || [], entry.id);
  if (!parts.length) return null;
  return h(
    'div',
    { class: 'rc-block' },
    h('div', { class: 'rc-block-label' }, 'Characters'),
    h(
      'div',
      { class: 'rc-parts' },
      parts.map((p) =>
        h(
          'div',
          { class: 'rc-part' },
          h('span', { class: 'rc-part-zh kai', lang: 'zh' }, p.word),
          pinyinLabel(p) ? h('span', { class: 'rc-part-py', lang: 'zh-Latn' }, pinyinLabel(p)) : null,
          p.meaning ? h('span', { class: 'rc-part-mean' }, p.meaning) : null,
        ),
      ),
    ),
  );
}

export function render(card, ctx) {
  const { item, settings, list } = ctx;
  const dir = card.dir === 'meaning' ? 'meaning' : 'word';
  let revealed = false; // the answer has been shown at least once
  let flipped = false; // the back face is showing
  let anim = [];

  // Hearing the word gives away its pinyin, so the front has a speaker only when the
  // characters are the question.
  const front =
    dir === 'word'
      ? h(
          'div',
          { class: 'fc-face fc-front' },
          sayButton(item.word, ctx.speak, { className: 'fc-say', variant: 'filled' }),
          h(
            'div',
            { class: 'fc-front-main' },
            h('div', { class: ['rc-word', 'kai', sizeClass(item.word)], lang: 'zh' }, item.word),
            settings.showPrint ? h('div', { class: 'rc-print print', lang: 'zh' }, item.word) : null,
          ),
          h('div', { class: 'fc-hint' }, 'Recall the pinyin and meaning, then tap'),
        )
      : h(
          'div',
          { class: 'fc-face fc-front' },
          h(
            'div',
            { class: 'fc-front-main' },
            h('div', { class: 'rc-front-label' }, 'Write or picture the characters'),
            pinyinNode(item, 'rc-pinyin'),
            item.meaning ? h('div', { class: 'rc-meaning' }, item.meaning) : null,
          ),
          h('div', { class: 'fc-hint' }, 'Tap to check'),
        );

  const back = h(
    'div',
    { class: 'fc-face fc-back', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'fc-back-head' },
      h(
        'div',
        { class: 'fc-back-title' },
        h('span', { class: 'rc-back-word kai', lang: 'zh' }, item.word),
        settings.showPrint ? h('span', { class: 'rc-back-print print', lang: 'zh' }, item.word) : null,
      ),
      // Hear the word, and how to write it (the word page), without turning the card.
      sayButton(item.word, ctx.speak, { className: 'rc-say', variant: 'filled' }),
      iconButton({
        icon: 'pencil',
        label: 'How to write it',
        variant: 'filled',
        className: 'rc-strokes',
        onTap: (e) => {
          e.stopPropagation();
          showWord(item, { entries: list.entries });
        },
      }),
    ),
    h('div', { class: 'rc-row' }, pinyinNode(item, 'rc-pinyin'), item.meaning ? h('div', { class: 'rc-meaning' }, item.meaning) : null),
    item.unsure ? h('div', { class: 'rc-unsure' }, 'The AI was not sure about this line: check it.') : null,
    exampleNode(item, { speak: ctx.speak }),
    partsNode(item, list.entries),
  );

  // A plain tap surface: "Show answer" in the footer is the accessible control.
  const cardEl = h('div', { class: 'fc-card', onClick: () => onCardTap() }, front, back);
  const el = h('div', { class: 'fc' }, h('div', { class: 'fc-scene' }, cardEl));

  function animating() {
    return anim.some((a) => a.playState === 'running');
  }

  function flip(to) {
    if (to === flipped || animating()) return;
    flipped = to;
    cardEl.classList.toggle('is-flipped', to);
    front.setAttribute('aria-hidden', String(to));
    back.setAttribute('aria-hidden', String(!to));
    if (typeof cardEl.animate !== 'function') return;
    cardEl.classList.add('is-animating');
    if (reducedMotion()) {
      const [shown, hidden] = to ? [back, front] : [front, back];
      anim = [
        shown.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'linear' }),
        hidden.animate([{ opacity: 1 }, { opacity: 1 }], { duration: FADE_MS }),
      ];
    } else {
      const from = to ? 0 : 180;
      const end = to ? 180 : 0;
      anim = [
        cardEl.animate(
          [{ transform: `rotateY(${from}deg) scale(1)` }, { transform: 'rotateY(90deg) scale(0.94)' }, { transform: `rotateY(${end}deg) scale(1)` }],
          { duration: FLIP_MS, easing: FLIP_EASE },
        ),
      ];
    }
    const done = () => {
      if (!animating()) cardEl.classList.remove('is-animating');
    };
    anim.forEach((a) => a.finished.then(done, done));
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    flip(true);
    // Inside the tap that revealed the answer, so iOS allows the speech.
    if (settings.autoSpeak && ctx.speak) ctx.speak(item.word);
    ctx.showGradeButtons();
  }

  function onCardTap() {
    // The first tap goes through the footer so practice.js stays in charge of the state;
    // afterwards the card just turns over and back.
    if (!revealed) ctx.submit();
    else flip(!flipped);
  }

  return {
    el,
    primaryLabel: 'Show answer',
    readyInitially: true,
    check() {
      reveal();
      return null;
    },
    grade(correct) {
      if (!flipped) flip(true);
      return {
        correct,
        feedback: {
          title: correct ? 'Nice!' : 'Keep practising',
          detail: [pinyinLabel(item), item.meaning].filter(Boolean).join(' · '),
        },
      };
    },
    destroy() {
      anim.forEach((a) => a.cancel());
      anim = [];
    },
  };
}
