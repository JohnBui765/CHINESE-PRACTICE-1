// "Write it": the writing practice for one word, shown inside the word page's sheet. The order of
// the steps (trace every character, write each from memory, copy one that went wrong, the whole
// word) is in core/drill.js; this draws each step and grades each write with Hanzi Writer.
// Nothing is saved: this is practice, not a test.
import { h, replaceChildren } from './dom.js';
import { button } from './components.js';
import { gridBox, borrowWriter, modelGlyph, rowBoxSize } from './strokes.js';
import { settings as currentSettings } from '../data/store.js';
import { startDrill, currentStep, record, skipTracing, isDone, roundOf, summary } from '../core/drill.js';
import { splitPinyin } from '../core/pinyin.js';
import { partsOf, pinyinLabel } from '../core/lists.js';
import { plural } from '../core/util.js';

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const NEXT_MS = 700; // after a write: long enough to see the finished character
const AGAIN_MS = 1500; // after a mistake: long enough to read what comes next
const MODEL = 88; // the model beside the box in the Copy step, px
// A step's buttons ignore taps this long after it starts: the second tap of a double tap on
// "Write it", "I know it" or "Again from memory" would land on the button now in its place.
const SETTLE_MS = 400;
// The hint stroke is drawn this slowly (Hanzi Writer's default, 2, flashes it in half a second).
const HINT_SPEED = 0.6;

// entry: the word; entries: its list (for the meanings of its characters); chars / datas: its
// characters and their stroke data (all present); width: the room in the sheet, px;
// speak(text): says Chinese text; onBack(): back to the word page.
export function drillView({ entry, entries = [], chars, datas, width = 358, speak, onBack }) {
  const settings = currentSettings();
  const leniency = Number(settings.writeLeniency) || 1;
  const hintAfter = settings.writeHintAfter > 0 ? Number(settings.writeHintAfter) : false;
  const count = chars.length;
  const boxSize = Math.max(150, Math.min(240, width - MODEL - 12));

  let drill = startDrill(count);
  let leases = []; // the writers of this step, borrowed from the pool (ui/strokes.js)
  let helpNow = null; // shows the stroke to write next (the "Show the stroke" button)
  let stepAt = 0; // when the current step started (performance.now())
  let token = 0; // callbacks from an earlier step are ignored
  let timer = 0;
  let destroyed = false;

  // The word's pinyin cut into syllables, one per character, to point at the one being written.
  // Not for words with 儿 (哪儿 nǎr is one syllable for two characters).
  const syllables = (() => {
    const word = chars.join('');
    if (word.includes('儿') || !entry.pinyin) return null;
    const out = splitPinyin(entry.pinyin, word);
    return out && out.length === count ? out : null;
  })();
  // The meanings of the characters, from the "> " lines under the word.
  const partMeaning = chars.map((ch) => partsOf(entries, entry.id).find((p) => p.word === ch)?.meaning || '');

  const roundNames = count > 1 ? ['Trace', 'From memory', 'Whole word'] : ['Trace', 'From memory'];
  const roundEls = roundNames.map((name) => h('li', { class: 'dr-round' }, name));
  const rounds = h('ol', { class: 'dr-rounds', 'aria-label': 'Steps' }, roundEls);
  const cue = h('div', { class: 'dr-cue' });
  const stage = h('div', { class: 'dr-stage' });
  const status = h('div', { class: 'dr-status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'dr-actions' });
  const back = button({ label: 'The word', icon: 'chevronLeft', variant: 'plain', size: 'small', className: 'dr-back', onTap: () => onBack && onBack() });
  const el = h('div', { class: 'dr' }, h('div', { class: 'dr-top' }, back), rounds, cue, stage, status, actions);

  function say(text, tone = '') {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function showRound(round) {
    roundEls.forEach((li, i) => {
      li.classList.toggle('now', i + 1 === round);
      li.classList.toggle('done', i + 1 < round || round === 0);
    });
  }

  // The pinyin of the word with the syllable of character `i` marked (or the whole word's pinyin).
  function pinyinCue(i) {
    if (syllables && i !== null) {
      const kids = [];
      syllables.forEach((s, j) => {
        if (j) kids.push(' ');
        kids.push(j === i ? h('span', { class: 'dr-syl' }, s) : s);
      });
      return h('div', { class: 'dr-pinyin', lang: 'zh-Latn' }, kids);
    }
    const p = pinyinLabel(entry);
    return p ? h('div', { class: 'dr-pinyin', lang: 'zh-Latn' }, p) : null;
  }

  function showCue(step) {
    const i = step.char;
    const which = count > 1 && i !== null ? `${ORDINAL[i] || `#${i + 1}`} character of ${count}` : '';
    if (step.kind === 'trace' || step.kind === 'copy') {
      replaceChildren(cue,
        h('div', { class: 'dr-title' }, step.kind === 'trace' ? 'Trace ' : 'Copy ', h('span', { class: 'kai', lang: 'zh' }, chars[i])),
        h('div', { class: 'dr-sub' }, step.kind === 'trace' ? 'Write over the grey strokes, in order.' : 'Look at the model, then write it in the box.', which ? ` ${which}.` : ''),
      );
    } else {
      replaceChildren(cue,
        h('div', { class: 'dr-title' }, step.kind === 'word' ? 'The whole word from memory' : 'From memory'),
        pinyinCue(step.kind === 'word' ? null : i),
        entry.meaning ? h('div', { class: 'dr-meaning' }, entry.meaning) : null,
        which ? h('div', { class: 'dr-sub' }, which, partMeaning[i] ? `: ${partMeaning[i]}` : '') : null,
      );
    }
  }

  function showActions(step) {
    if (step.kind === 'trace') {
      replaceChildren(actions,
        button({
          label: 'I know it',
          icon: 'arrowRight',
          variant: 'tinted',
          onTap: () => {
            if (settling()) return;
            drill = skipTracing(drill);
            runStep();
          },
        }),
      );
    } else if (step.kind === 'memory' || step.kind === 'word') {
      replaceChildren(actions, button({ label: 'Show the stroke', icon: 'lightbulb', variant: 'tinted', onTap: () => !settling() && helpNow && helpNow() }));
    } else {
      replaceChildren(actions);
    }
  }

  const settling = () => performance.now() - stepAt < SETTLE_MS;

  // The step's writers go back to the pool (their quizzes end there).
  function stopWriters() {
    for (const lease of leases) lease.release();
    leases = [];
    helpNow = null;
  }

  // Runs Hanzi Writer's quiz on character `i` in `box`; done({ mistakes, helped }) when its last
  // stroke is right. A wrong stroke is refused; after `hint` misses the right one lights up.
  function quiz(box, size, i, { outline, hint, prefix = '' }, done) {
    const mine = token;
    const total = datas[i].strokes.length;
    const lease = borrowWriter(box, chars[i], datas[i], { size, outline });
    leases.push(lease);
    const writer = lease.writer;
    let mistakes = 0;
    let helped = false;
    let stroke = 0;
    helpNow = () => {
      if (mine !== token) return;
      helped = true;
      writer.highlightStroke(stroke);
    };
    say(`${prefix}Stroke 1 of ${total}`);
    writer.quiz({
      leniency,
      showHintAfterMisses: hint,
      highlightOnComplete: true,
      acceptBackwardsStrokes: false,
      strokeHighlightSpeed: HINT_SPEED,
      onMistake: (s) => {
        if (mine !== token) return;
        mistakes += 1;
        if (hint && s.mistakesOnStroke >= hint) helped = true;
        say(s.isBackwards ? 'Right stroke, wrong direction: start from the other end.' : `Not that stroke. Try again (stroke ${s.strokeNum + 1} of ${total}).`, 'wrong');
      },
      onCorrectStroke: (s) => {
        if (mine !== token) return;
        stroke = s.strokeNum + 1;
        if (s.strokesRemaining > 0) say(`${prefix}Stroke ${stroke + 1} of ${total}`);
      },
      onComplete: () => {
        if (mine !== token) return;
        done({ mistakes, helped });
      },
    });
  }

  // Trace, copy or from memory: one character in one big box (with the model beside it to copy).
  function runChar(step) {
    const i = step.char;
    const box = gridBox(boxSize, { className: 'dr-box' });
    box.el.dataset.char = chars[i]; // for the browser test; not shown
    const row = step.kind === 'copy' ? [h('div', { class: 'dr-model' }, modelGlyph(datas[i], MODEL), h('div', { class: 'dr-model-label' }, 'Model')), box.el] : [box.el];
    replaceChildren(stage, h('div', { class: ['dr-row', step.kind === 'copy' && 'with-model'] }, row));
    const hint = step.kind === 'trace' ? 1 : step.kind === 'copy' ? 2 : hintAfter;
    quiz(box, boxSize, i, { outline: step.kind === 'trace', hint }, finishStep);
  }

  // The whole word: every character in its own box, one after the other.
  function runWord() {
    const size = rowBoxSize(count, width);
    const boxes = chars.map((ch) => {
      const b = gridBox(size, { className: 'dr-box' });
      b.el.dataset.char = ch;
      return b;
    });
    replaceChildren(stage, h('div', { class: 'dr-row dr-word' }, boxes.map((b) => b.el)));
    let mistakes = 0;
    let helped = false;
    const write = (i) => {
      boxes.forEach((b, j) => b.el.classList.toggle('dr-active', j === i));
      quiz(boxes[i], size, i, { outline: false, hint: hintAfter, prefix: `${ORDINAL[i] || `#${i + 1}`} character · ` }, (r) => {
        mistakes += r.mistakes;
        helped = helped || r.helped;
        if (i + 1 < count) write(i + 1);
        else {
          boxes.forEach((b) => b.el.classList.remove('dr-active'));
          finishStep({ mistakes, helped });
        }
      });
    };
    write(0);
  }

  function runStep() {
    clearTimeout(timer);
    stopWriters();
    if (destroyed) return;
    token += 1;
    stepAt = performance.now();
    if (isDone(drill)) return showSummary();
    const step = currentStep(drill);
    showRound(roundOf(step));
    showCue(step);
    showActions(step);
    if (step.kind === 'word') runWord();
    else runChar(step);
  }

  // A write has ended: grade it, say what comes next, and go on after a short pause. Runs inside
  // the touch that drew the last stroke, so iOS lets the word be spoken here.
  function finishStep({ mistakes, helped }) {
    const step = currentStep(drill);
    const clean = mistakes === 0 && !helped;
    drill = record(drill, { clean });
    token += 1; // ignore anything else from this step's writers
    helpNow = null;
    replaceChildren(actions);
    const slips = mistakes ? plural(mistakes, 'wrong stroke') : 'With help';
    let wait = NEXT_MS;
    if (step.kind === 'trace' || step.kind === 'copy') say(mistakes ? `Done · ${plural(mistakes, 'wrong stroke')}.` : 'Good.', 'right');
    else if (clean) say(step.kind === 'word' ? 'The whole word, no mistakes!' : 'From memory, no mistakes!', 'right');
    else {
      wait = AGAIN_MS;
      const next = currentStep(drill);
      if (next?.kind === 'copy') say(`${slips}. Copy it once, then try again.`, 'wrong');
      else if (next?.kind === 'word' && step.kind === 'word') say(`${slips}. Once more.`, 'wrong');
      else say(`${slips}. Moving on: it is on the list at the end.`, 'wrong');
    }
    if (isDone(drill) && settings.autoSpeak && speak) speak(entry.word);
    timer = setTimeout(runStep, wait);
  }

  function showSummary() {
    stopWriters();
    showRound(0);
    const sum = summary(drill);
    const lines = sum.chars.map((c) =>
      h(
        'li',
        { class: ['dr-result', !c.clean ? 'wrong' : c.tries === 1 ? 'right' : 'close'] },
        modelGlyph(datas[c.index], 52),
        h('span', { class: 'dr-result-text' }, !c.clean ? 'Look at it again' : c.tries === 1 ? 'From memory, first try' : `From memory after ${c.tries} tries`),
      ),
    );
    if (sum.word) lines.push(h('li', { class: ['dr-result', 'dr-result-word', sum.word.clean ? 'right' : 'wrong'] }, h('span', { class: 'dr-result-text' }, sum.word.clean ? 'The whole word from memory' : 'The whole word had mistakes')));
    replaceChildren(cue,
      h('div', { class: 'dr-title' }, sum.perfect ? 'Perfect: all from memory' : 'Done'),
      h('div', { class: 'dr-done-word kai', lang: 'zh' }, entry.word),
      pinyinCue(null),
      entry.meaning ? h('div', { class: 'dr-meaning' }, entry.meaning) : null,
    );
    replaceChildren(stage, h('ul', { class: 'dr-results' }, lines));
    say('');
    replaceChildren(actions,
      button({
        label: 'Again from memory',
        icon: 'refresh',
        onTap: () => {
          drill = startDrill(count, { skipTrace: true });
          runStep();
        },
      }),
      button({ label: 'The word', variant: 'plain', onTap: () => onBack && onBack() }),
    );
  }

  runStep();

  return {
    el,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      token += 1;
      stopWriters();
    },
  };
}
