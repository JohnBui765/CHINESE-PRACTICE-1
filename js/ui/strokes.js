// Stroke order on screen: a 田字格 box with a Hanzi Writer inside (animation or writing quiz),
// the numbered stroke-order diagram, and the Strokes sheet opened from cards and list entries.
// Hanzi Writer always gets the app's own data through charDataLoader (its default would fetch
// a CDN, which this app never does).
import HanziWriter from '../../vendor/hanzi-writer.esm.js';
import { h, svg } from './dom.js';
import { button, segmented, sheet, toast } from './components.js';
import { speak } from './speech.js';
import { strokeData } from '../data/strokes.js';
import { settings } from '../data/store.js';
import { glyphTransform, glyphPoint, diagramSteps } from '../core/strokes.js';
import { chineseChars } from '../core/extract.js';

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

// A Hanzi Writer for one character, drawing with the app's data. `data` = { strokes, medians }.
export function makeWriter(target, char, data, { size, outline = false, character = false, speed = 1, delay = 450, drawingWidth } = {}) {
  const c = colours();
  return HanziWriter.create(target, char, {
    width: size,
    height: size,
    padding: Math.round(size * 0.08),
    charDataLoader: () => ({ strokes: data.strokes, medians: data.medians }),
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

// The Strokes sheet for a word: its characters as a picker, one animating in a big 田字格,
// controls (play again, one stroke at a time, slower) and the numbered diagram.
export async function showStrokes(word) {
  const chars = [...chineseChars(word || '')];
  const datas = await Promise.all(chars.map((ch) => strokeData(ch)));
  const items = chars.map((ch, i) => ({ ch, data: datas[i] })).filter((x) => x.data);
  if (!items.length) {
    toast('No stroke data for this character.', { icon: 'info', tone: 'accent' });
    return null;
  }
  const size = Math.max(200, Math.min(300, (typeof innerWidth === 'number' ? innerWidth : 390) - 64));
  const box = gridBox(size, { className: 'sk-main' });
  const title = h('div', { class: 'sk-title' });
  const diagramHost = h('div', { class: 'sk-diagram-host' });
  let current = 0;
  let writer = null;
  let slow = false;
  let nextStroke = 0;

  const playBtn = button({ label: 'Play again', icon: 'play', variant: 'tinted', onTap: () => animate() });
  const stepBtn = button({ label: 'One stroke', icon: 'arrowRight', variant: 'tinted', onTap: () => step() });
  const sayBtn = button({ label: 'Hear it', icon: 'speaker', variant: 'plain', onTap: () => {
    const s = settings();
    speak(items[current].ch, { rate: s.speechRate, voiceURI: s.voiceURI });
  } });
  const slowBtn = button({ label: 'Slower', icon: 'clock', variant: 'plain', onTap: () => {
    slow = !slow;
    slowBtn.querySelector('span').textContent = slow ? 'Normal speed' : 'Slower';
    select(current);
  } });
  const picker = items.length > 1 ? segmented({ options: items.map((x, i) => ({ value: i, label: x.ch })), value: 0, ariaLabel: 'Character', onChange: (i) => select(i) }) : null;
  if (picker) picker.classList.add('sk-picker', 'kai');

  function stop() {
    if (writer) {
      try {
        writer.pauseAnimation();
      } catch {
        /* nothing running */
      }
    }
  }

  function select(i) {
    stop();
    current = i;
    const { ch, data } = items[i];
    box.target.replaceChildren();
    writer = makeWriter(box.target, ch, data, { size, outline: true, character: false, speed: slow ? 0.35 : 1, delay: slow ? 700 : 450 });
    title.textContent = `${ch} · ${data.strokes.length} ${data.strokes.length === 1 ? 'stroke' : 'strokes'}`;
    diagramHost.replaceChildren(diagramRow(data));
    animate();
  }

  function animate() {
    nextStroke = 0;
    writer.animateCharacter({ onComplete: () => { nextStroke = items[current].data.strokes.length; } });
  }

  // One stroke per tap, from the start again after the last one.
  async function step() {
    const total = items[current].data.strokes.length;
    if (nextStroke >= total || nextStroke === 0) {
      await writer.hideCharacter({ duration: 0 });
      nextStroke = 0;
    }
    writer.animateStroke(nextStroke);
    nextStroke += 1;
  }

  const content = h('div', { class: 'sk-sheet' }, picker, box.el, title, h('div', { class: 'sk-controls' }, playBtn, stepBtn, slowBtn, sayBtn), diagramHost, h('p', { class: 'sk-note' }, 'Mainland China stroke order. Your textbook has the last word.'));
  const s = sheet({ title: 'Strokes', content, onClose: () => stop() });
  select(0);
  return s;
}
