// Pick the characters: the pinyin and meaning are shown (and can be heard), and the learner taps
// the right word among four from the same lesson. Tapping a tile answers the card.
import { h } from '../../ui/dom.js';
import { iconButton } from '../../ui/components.js';
import { chineseChars } from '../../core/extract.js';
import { pinyinLabel } from '../../core/lists.js';
import { pinyinNode } from './recall.js';

function tileSize(words) {
  const longest = Math.max(...words.map((w) => [...w].length), 1);
  if (longest <= 2) return '';
  if (longest <= 4) return 'long';
  return 'sentence';
}

export function render(card, ctx) {
  const { item, list } = ctx;
  const byId = new Map((list.entries || []).map((e) => [e.id, e]));
  let options = (card.options || []).map((id) => byId.get(id)).filter(Boolean);
  if (!options.some((o) => o.id === item.id)) options = [item, ...options];
  let result = null;

  const size = tileSize(options.map((o) => o.word));
  const tiles = options.map((opt) =>
    h(
      'button',
      { type: 'button', class: ['ch-tile', 'kai', size], lang: 'zh', dataset: { id: opt.id }, onClick: () => pick(opt) },
      opt.word,
    ),
  );

  const el = h(
    'div',
    { class: 'ch' },
    h('div', { class: 'rc-front-label' }, 'Pick the characters'),
    h('div', { class: 'ch-prompt' }, pinyinNode(item, 'rc-pinyin'), item.meaning ? h('div', { class: 'rc-meaning' }, item.meaning) : null),
    h('div', { class: 'ch-hear' }, iconButton({ icon: 'speaker', label: 'Hear it', variant: 'filled', onTap: (e) => { e.stopPropagation(); ctx.speak(chineseChars(item.word) || item.word); } })),
    h('div', { class: 'ch-tiles' }, tiles),
  );

  function pick(opt) {
    if (result) return;
    const correct = opt.id === item.id;
    for (const t of tiles) {
      t.disabled = true;
      if (t.dataset.id === item.id) t.classList.add('right');
      else if (t.dataset.id === opt.id) t.classList.add('wrong');
    }
    result = {
      correct,
      feedback: {
        title: correct ? undefined : 'Not quite',
        detail: [item.word, pinyinLabel(item), item.meaning].filter(Boolean).join(' · '),
      },
    };
    ctx.setReady(true);
    ctx.submit();
  }

  return {
    el,
    primaryLabel: 'Pick one',
    readyInitially: false,
    check() {
      return result;
    },
  };
}
