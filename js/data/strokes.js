// Loads the stroke-order data from data/strokes/ (cached offline by the service worker): the set
// of characters that have data, and one block file at a time, each fetched once.
import { blockFile } from '../core/strokes.js';

const blocks = new Map(); // file -> Promise<object | null>
let charsPromise = null;

// The characters that have stroke data (a Set). Empty when the file cannot be read.
export function strokeChars() {
  if (!charsPromise) {
    charsPromise = fetch('data/stroke-chars.txt')
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)))
      .catch((err) => {
        console.warn('Stroke character list not available', err);
        return new Set();
      });
  }
  return charsPromise;
}

function block(file) {
  if (!blocks.has(file)) {
    blocks.set(
      file,
      fetch(file)
        .then((res) => (res.ok ? res.json() : null))
        .catch((err) => {
          console.warn(`${file} not available`, err);
          blocks.delete(file); // try again next time
          return null;
        }),
    );
  }
  return blocks.get(file);
}

// { strokes, medians } for one character, or null when there is no data for it.
export async function strokeData(char) {
  if (!char) return null;
  const data = await block(blockFile(char));
  const d = data && data[char];
  return d ? { strokes: d.s, medians: d.m } : null;
}
