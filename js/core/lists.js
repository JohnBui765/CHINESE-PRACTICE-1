// Pure helpers for a list and its entries (no browser APIs: Node tests import this).
// An entry is a Hanzi Grid entry (word, depth, pinyin, said, meaning, example, examplePinyin,
// exampleMeaning, ...) plus an id that the practice progress is keyed by.
import { chineseChars, isSentence } from './extract.js';
import { uid } from './util.js';

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
