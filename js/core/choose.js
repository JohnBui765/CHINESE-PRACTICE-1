// "Pick the characters": which other words are shown next to the right one. Words of the same
// list that share a character with it come first (the confusable ones), then words of the same
// length, then any. Never the same text twice. No browser APIs.
import { chineseChars } from './extract.js';
import { shuffle } from './util.js';

const MAX_CHARS = 6;

// Returns the ids of the options, the right one among them in a random place, or null when
// there is nothing to choose from. `pool`: the entries the others are taken from (default: all).
export function chooseOptions(entries, entry, { count = 4, rng = Math.random, pool = null } = {}) {
  const word = chineseChars(entry?.word || '');
  if (!word) return null;
  const seen = new Set([word]);
  const candidates = [];
  for (const e of pool || entries) {
    if (!e || e.id === entry.id) continue;
    const w = chineseChars(e.word || '');
    if (!w || w.length > MAX_CHARS || seen.has(w)) continue;
    seen.add(w);
    candidates.push(e);
  }
  if (!candidates.length) return null;
  const chars = new Set(word);
  const score = (e) => {
    const cs = [...chineseChars(e.word)];
    let s = 0;
    if (cs.some((c) => chars.has(c))) s += 2;
    if (cs.length === word.length) s += 1;
    return s;
  };
  // Shuffle first so ties are broken at random; sort is stable.
  const ranked = shuffle(candidates, rng).sort((a, b) => score(b) - score(a));
  const picked = ranked.slice(0, Math.max(1, count - 1));
  return shuffle([entry, ...picked], rng).map((e) => e.id);
}
