// Pure helpers for the stroke-order data (no browser APIs: Node tests and the build tool import
// this). The data is animCJK's mainland-Chinese stroke data in the Make Me a Hanzi format: for
// each character, `strokes` (one SVG path per stroke, in stroke order) and `medians` (the
// centre line of each stroke as [x, y] points). Coordinates are in a 1024-unit box whose y axis
// points UP, with the top of the character at y = 900 and the bottom at y = -124.
import { chineseChars } from './extract.js';

// The data is shipped in one JSON file per 256 code points: data/strokes/4e.json holds
// U+4E00–U+4EFF. A file maps each character to { s: strokes, m: medians }.
export function blockName(char) {
  return (char.codePointAt(0) >> 8).toString(16).padStart(2, '0');
}

export function blockFile(char) {
  return `data/strokes/${blockName(char)}.json`;
}

// The writing mode quizzes words of 1 to WRITE_MAX_CHARS Chinese characters, all with stroke
// data. Returns the characters, or null when the word cannot be written.
export const WRITE_MAX_CHARS = 4;

export function writableChars(word, strokeChars) {
  const chars = [...chineseChars(word || '')];
  if (!chars.length || chars.length > WRITE_MAX_CHARS) return null;
  if (!strokeChars || !chars.every((c) => strokeChars.has(c))) return null;
  return chars;
}

// The SVG transform that draws the 1024-unit, y-up data inside a y-down square of `size` px.
export function glyphTransform(size) {
  const k = size / 1024;
  return `scale(${k} ${-k}) translate(0 -900)`;
}

// A point of the data in that square: [x, y] in px.
export function glyphPoint([x, y], size) {
  const k = size / 1024;
  return [x * k, (900 - y) * k];
}

// The steps of a stroke-order diagram: cell i shows strokes 0..i, the newest one marked, with
// its number at the start of its median.
export function diagramSteps(data) {
  return data.strokes.map((_, i) => ({
    index: i,
    paths: data.strokes.slice(0, i + 1),
    label: String(i + 1),
    at: data.medians[i][0],
  }));
}

// Checks one character's record from the data file; returns a reason or ''.
export function dataProblem(d) {
  if (!d || !Array.isArray(d.s) || !Array.isArray(d.m)) return 'not an object with s and m';
  if (!d.s.length || d.s.length !== d.m.length) return 'strokes and medians differ in number';
  if (!d.s.every((p) => typeof p === 'string' && /^M/.test(p))) return 'a stroke is not an SVG path';
  if (!d.m.every((m) => Array.isArray(m) && m.length >= 2 && m.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isInteger)))) return 'a median is not a list of integer points';
  return '';
}
