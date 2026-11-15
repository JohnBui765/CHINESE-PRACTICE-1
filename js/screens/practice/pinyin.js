// Type the pinyin: the characters are shown, the learner types the pinyin. Letters come from the
// keyboard; a tone bar under the field puts the tone mark on the last syllable typed (the iPhone
// keyboard cannot type ǎ or ǚ). Tone numbers (ni3 hao3) work too. Check grades letters and
// tones separately: right letters with wrong tones is "close" (orange), not right.
import { h } from '../../ui/dom.js';
import { textField, iconButton } from '../../ui/components.js';
import { gradePinyin, applyToneToLast } from '../../core/pinyincheck.js';
import { pinyinLabel } from '../../core/lists.js';
import { sizeClass } from './recall.js';

const TONES = [
  { tone: 1, label: 'ā', name: 'first tone' },
  { tone: 2, label: 'á', name: 'second tone' },
  { tone: 3, label: 'ǎ', name: 'third tone' },
  { tone: 4, label: 'à', name: 'fourth tone' },
  { tone: 5, label: 'a', name: 'neutral tone' },
];

export function render(card, ctx) {
  const { item, settings } = ctx;
  let result = null;

  const field = textField({
    placeholder: 'pinyin',
    answer: true,
    enterkeyhint: 'done',
    className: 'py-field',
    ariaLabel: 'Pinyin',
    onInput: (v) => ctx.setReady(v.trim().length > 0),
    onEnter: () => ctx.submit(),
  });

  // Keys that change the field without dropping the keyboard: the mousedown is cancelled so
  // focus stays in the field (the cloze word bank of Vocab Studio does the same).
  const key = (label, name, apply) =>
    h(
      'button',
      {
        type: 'button',
        class: 'py-tone',
        'aria-label': name,
        onMousedown: (e) => e.preventDefault(),
        onClick: () => {
          if (result) return;
          apply();
          ctx.setReady(field.value.trim().length > 0);
          if (document.activeElement !== field) field.focus({ preventScroll: true });
        },
      },
      label,
    );
  const bar = h(
    'div',
    { class: 'py-tones', role: 'group', 'aria-label': 'Tones' },
    TONES.map((t) => key(t.label, t.name, () => (field.value = applyToneToLast(field.value, t.tone)))),
    key('ü', 'the letter ü', () => (field.value += 'ü')),
  );

  const answer = h('div', { class: 'py-answer', hidden: true });
  const el = h(
    'div',
    { class: 'py' },
    h('div', { class: 'rc-front-label' }, 'Type the pinyin'),
    h('div', { class: ['py-word', 'kai', sizeClass(item.word)], lang: 'zh' }, item.word),
    settings.showPrint ? h('div', { class: 'rc-print print', lang: 'zh' }, item.word) : null,
    field,
    bar,
    answer,
  );

  function showAnswer(ok) {
    field.readOnly = true;
    field.classList.add(ok ? 'right' : 'wrong');
    answer.hidden = false;
    answer.replaceChildren(
      h('span', { class: 'py-answer-pinyin', lang: 'zh-Latn' }, pinyinLabel(item)),
      item.meaning ? h('span', { class: 'py-answer-meaning' }, ` · ${item.meaning}`) : null,
      iconButton({ icon: 'speaker', label: `Say ${item.word}`, className: 'py-say', onTap: (e) => { e.stopPropagation(); ctx.speak(item.word); } }),
    );
  }

  return {
    el,
    primaryLabel: 'Check',
    readyInitially: false,
    focus() {
      field.focus({ preventScroll: true });
    },
    check() {
      const typed = field.value;
      if (!typed.trim() || result) return result;
      const g = gradePinyin(typed, item, { tonesRequired: settings.pinyinTones !== false });
      result = {
        correct: g.correct,
        close: !g.correct && g.close,
        feedback: {
          title: g.correct ? (g.message || undefined) : g.message || 'Not quite',
          detail: [pinyinLabel(item), item.meaning].filter(Boolean).join(' · '),
        },
      };
      showAnswer(g.correct);
      if (settings.autoSpeak) ctx.speak(item.word);
      return result;
    },
  };
}
