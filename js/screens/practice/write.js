// Write the characters: the pinyin and meaning are shown, and the learner draws each stroke of
// each character in a 田字格, in order. Hanzi Writer checks every stroke (place, shape,
// direction). A wrong stroke is refused; after some misses the right stroke lights up as a hint.
// Result: no mistakes and no outline = right; mistakes, the outline or a hint = correct but
// hinted (the card keeps its box); "Can't remember", or three hints, = wrong. A card that was
// not perfect offers "Learn it": the word page opens on its writing practice.
import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { gridBox, borrowWriter } from '../../ui/strokes.js';
import { showWord } from '../../ui/word.js';
import { pinyinLabel } from '../../core/lists.js';
import { pinyinNode } from './recall.js';

const MAX_HINTS = 3;
// The card slides out for about this long after the next one is shown; its writers go back to
// the pool (ui/strokes.js) only then, so it never turns blank while it is still visible.
const RELEASE_MS = 450;

export function boxSize(count) {
  const width = Math.min(typeof innerWidth === 'number' ? innerWidth : 390, 430) - 64;
  return Math.max(72, Math.min(260, Math.floor((width - (count - 1) * 8) / count)));
}

export function render(card, ctx) {
  const { item, settings } = ctx;
  const chars = card.chars || [];
  const datas = chars.map((ch) => ctx.strokes?.get(ch) || null);
  const size = boxSize(chars.length);
  const hintAfter = settings.writeHintAfter > 0 ? settings.writeHintAfter : false;
  const traceAll = !!settings.writeOutline;

  let index = 0; // the character being written
  let strokeNum = 0;
  let mistakes = 0;
  let hints = 0; // strokes the app had to show
  let outlineShown = traceAll;
  let result = null;
  let gaveUp = false;
  const writers = [];
  const leases = []; // the writers, borrowed from the pool

  const boxes = chars.map((ch, i) => {
    const b = gridBox(size, { className: i === 0 ? 'wr-active' : '' });
    b.el.dataset.index = String(i);
    b.el.dataset.char = ch; // for the browser test; not visible
    return b;
  });
  const status = h('div', { class: 'wr-status', 'aria-live': 'polite' });
  const outlineBtn = button({ label: traceAll ? 'Outline on' : 'Show outline', icon: 'eye', variant: 'plain', size: 'small', onTap: () => toggleOutline() });
  const learnBtn = button({ label: 'Learn it', icon: 'pencil', variant: 'tinted', size: 'small', onTap: () => showWord(item, { entries: ctx.list?.entries || [], drill: true }) });
  learnBtn.hidden = true;
  const answer = h('div', { class: 'wr-answer', hidden: true }, h('div', { class: 'kai', lang: 'zh' }, item.word), h('div', { class: 'wr-answer-sub' }, [pinyinLabel(item), item.meaning].filter(Boolean).join(' · ')));
  const el = h(
    'div',
    { class: 'wr' },
    h('div', { class: 'wr-prompt' }, h('div', { class: 'rc-front-label' }, 'Write the characters'), pinyinNode(item, 'rc-pinyin'), item.meaning ? h('div', { class: 'rc-meaning' }, item.meaning) : null),
    h('div', { class: 'wr-boxes' }, boxes.map((b) => b.el)),
    status,
    h('div', { class: 'wr-controls' }, outlineBtn, learnBtn),
    answer,
  );

  const total = () => datas[index]?.strokes.length || 0;

  function say(text, wrong = false) {
    status.textContent = text;
    status.classList.toggle('wrong', wrong);
  }

  function setActive(i) {
    boxes.forEach((b, j) => b.el.classList.toggle('wr-active', j === i));
  }

  // Each character gets its writer when its turn comes (the quiz runs on one at a time).
  function startChar(i) {
    index = i;
    strokeNum = 0;
    setActive(i);
    const data = datas[i];
    if (!data) {
      // No data (should not happen: cards are built only for characters with data): show it.
      say('No stroke data for this character.', true);
      return finish();
    }
    const lease = borrowWriter(boxes[i], chars[i], data, { size, outline: outlineShown });
    leases.push(lease);
    const writer = lease.writer;
    writers[i] = writer;
    say(`${chars.length > 1 ? `Character ${i + 1} of ${chars.length} · ` : ''}stroke 1 of ${total()}`);
    writer.quiz({
      leniency: Number(settings.writeLeniency) || 1,
      showHintAfterMisses: hintAfter,
      highlightOnComplete: true,
      acceptBackwardsStrokes: false,
      onMistake: (s) => {
        mistakes += 1;
        if (hintAfter && s.mistakesOnStroke === hintAfter) hints += 1;
        say(s.isBackwards ? 'Right stroke, wrong direction: start from the other end.' : `Not that stroke. Try again (stroke ${s.strokeNum + 1} of ${total()}).`, true);
      },
      onCorrectStroke: (s) => {
        strokeNum = s.strokeNum + 1;
        if (s.strokesRemaining > 0) say(`${chars.length > 1 ? `Character ${i + 1} of ${chars.length} · ` : ''}stroke ${strokeNum + 1} of ${total()}`);
      },
      onComplete: () => {
        if (i + 1 < chars.length) startChar(i + 1);
        else finish();
      },
    });
  }

  function toggleOutline() {
    outlineShown = !outlineShown;
    if (outlineShown) hints = Math.max(hints, 1); // the outline is help too
    outlineBtn.querySelector('span').textContent = outlineShown ? 'Hide outline' : 'Show outline';
    const w = writers[index];
    if (w) (outlineShown ? w.showOutline() : w.hideOutline());
  }

  function finish() {
    if (result) return;
    const helped = hints > 0 || outlineShown || traceAll;
    const tooMuchHelp = hints >= MAX_HINTS;
    result = tooMuchHelp
      ? { correct: false, feedback: { title: 'The app had to show the strokes', detail: `${mistakes} wrong ${mistakes === 1 ? 'stroke' : 'strokes'} · ${hints} shown` } }
      : { correct: true, hinted: helped || mistakes > 0, feedback: { title: mistakes === 0 && !helped ? 'Perfect strokes!' : 'Done — with some help', detail: mistakes ? `${mistakes} wrong ${mistakes === 1 ? 'stroke' : 'strokes'}` : outlineShown ? 'Traced over the outline' : '' } };
    showAnswer();
    learnBtn.hidden = result.correct && !result.hinted;
    say(result.correct ? 'All strokes done.' : 'Look at the strokes again.', !result.correct);
    if (settings.autoSpeak && ctx.speak) ctx.speak(item.word);
    ctx.submit();
  }

  function showAnswer() {
    answer.hidden = false;
    outlineBtn.disabled = true;
  }

  // "Can't remember": the characters are drawn for the learner, and the card is wrong.
  function giveUp() {
    gaveUp = true;
    writers.forEach((w) => {
      try {
        w.cancelQuiz();
      } catch {
        /* no quiz */
      }
    });
    chars.forEach((ch, i) => {
      if (!writers[i] && datas[i]) {
        const lease = borrowWriter(boxes[i], ch, datas[i], { size, outline: false });
        leases.push(lease);
        writers[i] = lease.writer;
      }
      writers[i]?.animateCharacter();
    });
    showAnswer();
    learnBtn.hidden = false;
    result = { correct: false, feedback: { title: 'Watch the strokes', detail: [pinyinLabel(item), item.meaning].filter(Boolean).join(' · ') } };
    return result;
  }

  // The first character's quiz starts once the card is on the page (the writer measures nothing,
  // but iOS needs the element attached for touch events).
  queueMicrotask(() => startChar(0));

  return {
    el,
    primaryLabel: "Can't remember",
    readyInitially: true,
    check() {
      if (result && !gaveUp) return result;
      return giveUp();
    },
    destroy() {
      writers.forEach((w) => {
        try {
          w.cancelQuiz();
        } catch {
          /* no quiz */
        }
      });
      setTimeout(() => leases.forEach((lease) => lease.release()), RELEASE_MS);
    },
  };
}
