// Pure helpers for a list and its entries (no browser APIs: Node tests import this).
// An entry is a Hanzi Grid entry (word, depth, pinyin, said, meaning, example, examplePinyin,
// exampleMeaning, ...) plus an id that the practice progress is keyed by.
import { chineseChars, isSentence } from './extract.js';
import { uid } from './util.js';
import { stripAccents } from './text.js';

export const entryKey = (e) => `${Number(e?.depth) || 0}|${e?.word ?? ''}`;

// Gives every entry an id. When the old entries of the list are given, an entry with the same
// word at the same depth keeps its old id (first come, first served), so its practice progress
// survives "Edit list".
export function withIds(entries, oldEntries = []) {
  const pool = new Map();
  for (const old of oldEntries) {
    if (!old || typeof old.id !== 'string') continue;
    const key = entryKey(old);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(old.id);
  }
  return entries.map((e) => {
    const ids = pool.get(entryKey(e));
    const id = ids && ids.length ? ids.shift() : uid();
    return { ...e, id };
  });
}

// How many words, sentences and characters (the "> " lines) a list has.
export function counts(list) {
  const out = { words: 0, sentences: 0, chars: 0, total: 0 };
  for (const e of list?.entries || []) {
    out.total += 1;
    if ((Number(e.depth) || 0) > 0) out.chars += 1;
    else if (isSentence(e.word)) out.sentences += 1;
    else out.words += 1;
  }
  return out;
}

// "12 words · 3 sentences · 25 characters" (only the parts that are not zero).
export function countLabel(list) {
  const c = counts(list);
  const parts = [];
  if (c.words) parts.push(`${c.words} ${c.words === 1 ? 'word' : 'words'}`);
  if (c.sentences) parts.push(`${c.sentences} ${c.sentences === 1 ? 'sentence' : 'sentences'}`);
  if (c.chars) parts.push(`${c.chars} ${c.chars === 1 ? 'character' : 'characters'}`);
  return parts.join(' · ') || 'empty';
}

// The entries listed directly under an entry (its characters, or a sentence's chunks).
export function partsOf(entries, id) {
  const at = entries.findIndex((e) => e.id === id);
  if (at < 0) return [];
  const depth = Number(entries[at].depth) || 0;
  const out = [];
  for (let i = at + 1; i < entries.length; i++) {
    const d = Number(entries[i].depth) || 0;
    if (d <= depth) break;
    if (d === depth + 1) out.push(entries[i]);
  }
  return out;
}

// "nǐ → ní" when the pinyin as said in the word differs, else the pinyin alone.
export function pinyinLabel(entry) {
  const pinyin = String(entry?.pinyin || '').trim();
  const said = String(entry?.said || '').trim();
  if (!pinyin) return said;
  return said && said !== pinyin ? `${pinyin} → ${said}` : pinyin;
}

// Where the word is in its example sentence, for the underline: { start, end }, or null when
// the sentence does not contain the word.
export function exampleUnderline(entry) {
  const word = chineseChars(entry?.word || '');
  const start = word ? String(entry?.example ?? '').indexOf(word) : -1;
  return start < 0 ? null : { start, end: start + word.length };
}

// Characters that deserve a look: not among the 3,500 common characters (orange), or missing
// from the app's fonts (red). `sets` = { common: Set, fonts: Set } from data/.
export function charWarnings(text, sets) {
  const out = { rare: [], missing: [] };
  if (!sets) return out;
  for (const ch of new Set(chineseChars(text || ''))) {
    if (sets.fonts && !sets.fonts.has(ch)) out.missing.push(ch);
    else if (sets.common && !sets.common.has(ch)) out.rare.push(ch);
  }
  return out;
}

/* ---------- finding a word ---------- */

// Lowercase, accent-free, single-spaced, so "Nǐ hǎo" matches "ni hao".
export const fold = (s) => stripAccents(String(s ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();

// Pinyin as bare letters, so tones, spaces, apostrophes and tone numbers never matter: "Nǐ hǎo",
// "ni3 hao3" and "nihao" are all "nihao". ü counts as u, and so do u: and the v typed for it
// after n or l (nv, lv: the only places ü is written as v), so "tv" or "van" stay English.
export const pinyinLetters = (s) =>
  fold(String(s ?? '').replace(/u:/gi, 'u'))
    .replace(/([nl])v/g, '$1u')
    .replace(/[^a-z]/g, '');

// The words of a meaning, for matching: "(measure word for books)" -> " measure word for books".
const meaningWords = (s) => ` ${fold(s).replace(/[^a-z0-9']+/g, ' ').trim()}`;
// "to go" and "go", "a book" and "book" mean the same here.
const bare = (s) => s.replace(/^(to|a|an|the) /, '');

// The pieces of a meaning: "to miss, to want" -> ['miss', 'want'].
export const meaningParts = (meaning) =>
  String(meaning ?? '')
    .split(/[;,/]/)
    .map((p) => bare(meaningWords(p).trim()))
    .filter(Boolean);

// Two entries mean the same when their meanings share a piece: 奶 and 牛奶 are both "milk",
// 想 "to miss, to want" and 要 "to want" share "want". Entries without a meaning never do.
export function sameMeaning(a, b) {
  const mine = new Set(meaningParts(a?.meaning));
  return meaningParts(b?.meaning).some((p) => mine.has(p));
}

// How well an entry matches what was typed: 0 exactly, 1 at the start of its pinyin or of a word
// of its meaning, 2 somewhere inside (3 letters or more), -1 not at all. Chinese characters in
// the query are looked for in the word; letters in the pinyin (tones optional) and the meaning.
export function matchEntry(entry, query) {
  const q = String(query ?? '').trim();
  if (!q || !entry) return -1;
  const zh = chineseChars(q);
  if (zh) {
    const word = chineseChars(entry.word || '');
    if (word === zh) return 0;
    if (word.startsWith(zh)) return 1;
    return word.includes(zh) ? 2 : -1;
  }
  let best = -1;
  const take = (rank) => {
    if (best < 0 || rank < best) best = rank;
  };
  const letters = pinyinLetters(q);
  if (letters) {
    for (const p of [entry.pinyin, entry.said]) {
      const have = pinyinLetters(p);
      if (!have) continue;
      if (have === letters) take(0);
      else if (have.startsWith(letters)) take(1);
      else if (letters.length >= 3 && have.includes(letters)) take(2);
    }
  }
  const words = meaningWords(q).trim();
  if (words && entry.meaning) {
    const meaning = meaningWords(entry.meaning);
    if (meaningParts(entry.meaning).includes(bare(words))) take(0);
    else if (meaning.includes(` ${words}`)) take(1);
    else if (words.length >= 3 && meaning.includes(words)) take(2);
  }
  return best;
}

// The words that match a search across lists, best first: [{ word, entry, list, lists, rank }].
// A word that is in several lists (or several times in one, like 国 under 中国 and 法国) is one
// result; `lists` names every list it is in, `entry` and `list` are where it matched best. A
// character with two readings (行 xíng, 行 háng) gives a result for each.
// Ties keep the order of `lists` (most recently updated first), then the lesson order.
export function searchWords(lists, query, { limit = 40 } = {}) {
  const groups = new Map();
  let order = 0;
  for (const list of lists || []) {
    for (const entry of list?.entries || []) {
      order += 1;
      const rank = matchEntry(entry, query);
      if (rank < 0) continue;
      const key = `${entry.word}|${pinyinLetters(entry.pinyin)}`;
      const found = groups.get(key);
      if (!found) {
        groups.set(key, { word: entry.word, entry, list, lists: [{ id: list.id, name: list.name }], rank, order });
        continue;
      }
      if (!found.lists.some((l) => l.id === list.id)) found.lists.push({ id: list.id, name: list.name });
      if (rank < found.rank) Object.assign(found, { entry, list, rank });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map(({ word, entry, list, lists: inLists, rank }) => ({ word, entry, list, lists: inLists, rank }));
}
