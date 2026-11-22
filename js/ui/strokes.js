// Stroke order on screen: a 田字格 box with a Hanzi Writer inside (animation or writing quiz), the
// numbered stroke-order diagram and a still model of a character. The word page (ui/word.js) and
// the writing practice (ui/drill.js, practice/write.js) are built from these.
// Hanzi Writer always gets the app's own data through charDataLoader (its default would fetch
// a CDN, which this app never does).
import HanziWriter from '../../vendor/hanzi-writer.esm.js';
import { h, svg } from './dom.js';
import { glyphTransform, glyphPoint, diagramSteps } from '../core/strokes.js';

export function isDark() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

// Hanzi Writer wants plain colour strings, so the theme colours are chosen here.
export function colours() {
  const dark = isDark();
  return {
    stroke: dark ? '#f2f2f7' : '#1c1c1e', // the character's strokes
    faint: dark ? '#8e8e93' : '#aeaeb2', // earlier strokes in the diagram
    outline: dark ? '#4a4a4e' : '#d1d1d6', // the trace outline
    drawing: dark ? '#e5e5ea' : '#1c1c1e', // what the learner draws
    highlight: '#ff9f0a', // the hint after misses
    complete: '#30d158', // the flash when a character is finished
    grid: dark ? '#48484a' : '#c7c7cc', // the 田字格 lines
    number: '#ff453a', // the newest stroke and its number in the diagram
  };
}

function gridLines(size, c) {
  return [
    svg('rect', { x: 0.75, y: 0.75, width: size - 1.5, height: size - 1.5, rx: Math.max(4, size * 0.03), fill: 'none', stroke: c.grid, 'stroke-width': 1.5 }),
    svg('path', { d: `M${size / 2} 4V${size - 4}M4 ${size / 2}H${size - 4}`, fill: 'none', stroke: c.grid, 'stroke-width': 1, 'stroke-dasharray': '6 5' }),
  ];
}

// A 田字格 box of `size` px with an empty target for a writer on top.
export function gridBox(size, { className = '' } = {}) {
  const c = colours();
  const bg = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'sk-grid', 'aria-hidden': 'true' }, ...gridLines(size, c));
  const target = h('div', { class: 'sk-target' });
  const el = h('div', { class: ['sk-box', className], style: { width: `${size}px`, height: `${size}px` } }, bg, target);
  return { el, target };
}

// A Hanzi Writer for one character, drawing with the app's data. `data` = { strokes, medians },
// or a function that returns it (a pooled writer reads its current character's data).
export function makeWriter(target, char, data, { size, outline = false, character = false, speed = 1, delay = 450, drawingWidth } = {}) {
  const c = colours();
  return HanziWriter.create(target, char, {
    width: size,
    height: size,
    padding: Math.round(size * 0.08),
    charDataLoader: () => {
      const d = typeof data === 'function' ? data() : data;
      return { strokes: d.strokes, medians: d.medians };
    },
    showOutline: outline,
    showCharacter: character,
    strokeColor: c.stroke,
    outlineColor: c.outline,
    drawingColor: c.drawing,
    highlightColor: c.highlight,
    highlightCompleteColor: c.complete,
    strokeAnimationSpeed: speed,
    delayBetweenStrokes: delay,
    drawingWidth: drawingWidth ?? Math.max(8, Math.round(size / 22)),
    strokeWidth: 2,
    outlineWidth: 2,
  });
}

// The stroke-order diagram: one small cell per stroke; earlier strokes grey, the newest in red
// with its number at its start.
export function diagramRow(data, { cell = 46 } = {}) {
  const c = colours();
  const steps = diagramSteps(data);
  return h(
    'div',
    { class: 'sk-diagram', role: 'img', 'aria-label': `Stroke order, ${steps.length} strokes` },
    steps.map((step) => {
      const [x, y] = glyphPoint(step.at, cell);
      // Keep the number inside the cell.
      const nx = Math.min(cell - 8, Math.max(8, x));
      const ny = Math.min(cell - 8, Math.max(8, y));
      return svg(
        'svg',
        { viewBox: `0 0 ${cell} ${cell}`, width: cell, height: cell, class: 'sk-cell' },
        ...gridLines(cell, c),
        svg('g', { transform: glyphTransform(cell) }, ...step.paths.map((d, i) => svg('path', { d, fill: i === step.index ? c.number : c.faint }))),
        svg('circle', { cx: nx, cy: ny, r: 7, fill: c.number }),
        svg('text', { x: nx, y: ny, class: 'sk-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, document.createTextNode(step.label)),
      );
    }),
  );
}

// A finished character drawn from the data (no animation): the model beside the box in the Copy
// step of "Write it".
export function modelGlyph(data, size) {
  const c = colours();
  return svg(
    'svg',
    { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'sk-model', role: 'img', 'aria-label': 'Model' },
    ...gridLines(size, c),
    svg('g', { transform: glyphTransform(size) }, ...data.strokes.map((d) => svg('path', { d, fill: c.stroke }))),
  );
}

// The size of the 田字格 boxes for a word of `count` characters in `width` px: one character
// large, at most four boxes a row (longer texts wrap).
export function rowBoxSize(count, width, { gap = 10, single = 240, max = 170, min = 64 } = {}) {
  const perRow = Math.max(1, Math.min(count, 4));
  const fit = Math.floor((width - (perRow - 1) * gap) / perRow);
  return Math.max(min, Math.min(count === 1 ? single : max, fit));
}

/* ---------- reusing writers ---------- */

// Hanzi Writer 3.7.3 adds a mouseup and a touchend listener to `document` for every writer and
// never removes them, so a writer is never freed (about 30 KB each, measured). The word page,
// "Write it" and the writing mode therefore borrow writers and give them back, and a writer is
// reused for the next character: setCharacter() loads it without adding listeners. One pool per
// box size and animation speed, so the app keeps a few dozen writers at most.
const pools = new Map(); // `${size}|${speed}|${delay}` -> free slots: { writer, target, data, dark }

function repaint(slot) {
  const dark = isDark();
  if (slot.dark === dark) return;
  slot.dark = dark;
  const c = colours();
  const colourOf = { strokeColor: c.stroke, outlineColor: c.outline, drawingColor: c.drawing, highlightColor: c.highlight, highlightCompleteColor: c.complete };
  for (const [name, value] of Object.entries(colourOf)) slot.writer.updateColor(name, value, { duration: 0 });
}

// A writer for `char` in `box` (from gridBox), starting empty: the outline only when `outline`.
// Returns { writer, release() }; after release() the writer must not be used again.
export function borrowWriter(box, char, data, { size, outline = false, speed = 1, delay = 450 } = {}) {
  const key = `${size}|${speed}|${delay}`;
  if (!pools.has(key)) pools.set(key, []);
  const free = pools.get(key);
  let slot = free.pop();
  if (slot) {
    slot.data = data;
    slot.writer.setCharacter(char);
    repaint(slot);
    if (outline) slot.writer.showOutline({ duration: 0 });
    else slot.writer.hideOutline({ duration: 0 });
    slot.writer.hideCharacter({ duration: 0 });
  } else {
    slot = { data, target: h('div', { class: 'sk-target' }), dark: isDark() };
    slot.writer = makeWriter(slot.target, char, () => slot.data, { size, outline, character: false, speed, delay });
  }
  box.target.replaceWith(slot.target);
  box.target = slot.target;
  let released = false;
  return {
    writer: slot.writer,
    release() {
      if (released) return;
      released = true;
      try {
        slot.writer.cancelQuiz();
        slot.writer.hideCharacter({ duration: 0 }); // also ends an animation still running or paused
      } catch {
        /* nothing to stop */
      }
      slot.target.remove();
      free.push(slot);
    },
  };
}
