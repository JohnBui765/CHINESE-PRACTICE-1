// Loads the built-in HSK dictionary from data/hsk/ (cached offline by the service worker), once.
// Each level is a list of its own, so the Lists search can find its words like a list's.
import { readHsk } from '../core/hsk.js';

export const HSK_LEVELS = [1, 2, 3];

let promise = null;

// { lists: [{ id: 'hsk1', name: 'HSK 1', entries }, ...], byWord: Map(word -> entries) }.
// Without its files the app still works: the dictionary is then empty, and tried again next time.
export function hskDictionary() {
  if (!promise) {
    promise = Promise.all(
      HSK_LEVELS.map((level) =>
        fetch(`data/hsk/hsk${level}.txt`)
          .then((res) => (res.ok ? res.text() : ''))
          .catch((err) => {
            console.warn(`HSK ${level} not available`, err);
            return '';
          })
          .then((text) => ({ id: `hsk${level}`, name: `HSK ${level}`, entries: readHsk(text, level) })),
      ),
    ).then((all) => {
      const lists = all.filter((l) => l.entries.length);
      if (lists.length < all.length) promise = null;
      const byWord = new Map();
      for (const list of lists) {
        for (const entry of list.entries) {
          if (!byWord.has(entry.word)) byWord.set(entry.word, []);
          byWord.get(entry.word).push(entry);
        }
      }
      return { lists, byWord };
    });
  }
  return promise;
}
