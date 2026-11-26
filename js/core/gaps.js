// "Fill the gap": where an entry can be blanked in a sentence of its own list, and the word bank
// offered for the gap. No AI: the sentences are the list's "= " lines (examples) and its
// sentence entries. No browser APIs (Node tests import this).
//
// A card remembers its sentence and its gap: { listId, type: 'cloze', itemId, from, src, start,
// end, options }. `from` is the entry whose sentence is used, `src` says which text of it:
// 'example' (its "= " line) or 'sentence' (the entry itself is a sentence). `start`/`end` are
// the gap in that text; `options` are the ids of the word bank, the right one among them.
import { chineseChars, isSentence } from './extract.js';
import { exampleUnderline, partsOf, sameMeaning } from './lists.js';
import { chooseOptions } from './choose.js';
import { pick } from './util.js';

export const BANK_SIZE = 8;
// A word of this many characters or more may also be blanked in the other sentences of its list
// that contain it. A single character may not: 天 would be "found" inside 明天.
const BORROW_MIN = 2;

const depthOf = (e) => Number(e?.depth) || 0;
const isSentenceEntry = (e) => depthOf(e) === 0 && isSentence(e?.word);

// The sentence of `entry` that `src` names, with its pinyin and English, or null.
export function sentenceOf(entry, src) {
  if (!entry) return null;
  if (src === 'example') {
    return entry.example ? { text: String(entry.example), pinyin: entry.examplePinyin || '', english: entry.exampleMeaning || '' } : null;
  }
  if (src === 'sentence' && isSentenceEntry(entry)) return { text: String(entry.word), pinyin: entry.pinyin || '', english: entry.meaning || '' };
  return null;
}

// Every sentence of a list: [{ from, src, text }].
export function listSentences(entries) {
  const out = [];
  for (const e of entries || []) {
    if (e.example) out.push({ from: e.id, src: 'example', text: String(e.example) });
    if (isSentenceEntry(e)) out.push({ from: e.id, src: 'sentence', text: String(e.word) });
  }
  return out;
}

// Where the parts of a text are, in order: walks along the text part by part, stepping over
// punctuation. A part that does not come next is looked for anywhere in the text, and left out
// when it is not there. Used for a sentence's chunks and for a word's characters (姐姐 has two
// 姐 lines: the first is the first 姐). -> [{ part, start, end }]
export function partSpans(text, parts) {
  const spans = [];
  let at = 0;
  for (const part of parts) {
    const piece = chineseChars(part.word || '');
    if (!piece) continue;
    let start = text.indexOf(piece, at);
    if (start < 0) start = text.indexOf(piece);
    if (start < 0) continue;
    spans.push({ part, start, end: start + piece.length });
    if (start >= at) at = start + piece.length;
  }
  return spans;
}

// Where a word is in the list's sentences: its own "= " line first, then (2 or more characters)
// every other sentence that contains it. -> [{ from, src, start, end }]
function placesOfWord(entry, sentences) {
  const word = chineseChars(entry.word || '');
  if (!word) return [];
  const out = [];
  const own = exampleUnderline(entry);
  if (own) out.push({ from: entry.id, src: 'example', ...own });
  if ([...word].length < BORROW_MIN) return out;
  for (const s of sentences) {
    if (s.from === entry.id) continue; // its own "= " line is above; a sentence entry is not "in" itself
    const start = s.text.indexOf(word);
    if (start >= 0) out.push({ from: s.from, src: s.src, start, end: start + word.length });
  }
  return out;
}

// Every gap an entry can have: [{ from, src, start, end, answerId }]. `answerId` is the entry
// that fills the gap: the entry itself, or for a sentence one of its chunks.
//   - a sentence: one of its chunks ("> " lines), never a chunk that is the whole sentence;
//   - a word: its own "= " line, and (2+ characters) the list's other sentences containing it;
//   - a "> " line under a sentence (a chunk): its own "= " line, else its place in the sentence;
//   - a "> " line under a word (a character): its own "= " line, else its place inside the word,
//     wherever the word is blanked (超 under 超市: ［ ］市在哪儿？ or 明天我去［ ］市。).
// Parts of parts (">> " lines) have no gap.
export function gapsOf(entries, entry, sentences = listSentences(entries)) {
  if (!entry || !chineseChars(entry.word || '')) return [];
  const depth = depthOf(entry);
  if (depth === 0 && isSentenceEntry(entry)) {
    const text = String(entry.word);
    const whole = chineseChars(text);
    return partSpans(text, partsOf(entries, entry.id))
      .filter((s) => chineseChars(s.part.word) !== whole)
      .map((s) => ({ from: entry.id, src: 'sentence', start: s.start, end: s.end, answerId: s.part.id }));
  }
  if (depth === 0) return placesOfWord(entry, sentences).map((p) => ({ ...p, answerId: entry.id }));
  if (depth > 1) return [];
  const own = exampleUnderline(entry);
  if (own) return [{ from: entry.id, src: 'example', ...own, answerId: entry.id }];
  const at = entries.findIndex((e) => e.id === entry.id);
  let parent = null;
  for (let i = at - 1; i >= 0; i--) {
    if (depthOf(entries[i]) === 0) {
      parent = entries[i];
      break;
    }
  }
  if (!parent) return [];
  if (isSentenceEntry(parent)) {
    const span = partSpans(String(parent.word), partsOf(entries, parent.id)).find((s) => s.part.id === entry.id);
    return span ? [{ from: parent.id, src: 'sentence', start: span.start, end: span.end, answerId: entry.id }] : [];
  }
  const inWord = partSpans(chineseChars(parent.word), partsOf(entries, parent.id)).find((s) => s.part.id === entry.id);
  if (!inWord) return [];
  return placesOfWord(parent, sentences).map((p) => ({ from: p.from, src: p.src, start: p.start + inWord.start, end: p.start + inWord.end, answerId: entry.id }));
}

// The word bank for a gap: up to 8 entries of the same kind as the answer (words with words,
// characters and chunks with characters and chunks), the confusable ones first, never a
// sentence and never a word that means the same (奶 and 牛奶 are both "milk"). -> ids or null
export function bankFor(entries, answer, { rng = Math.random, count = BANK_SIZE } = {}) {
  const kind = depthOf(answer) > 0;
  const pool = entries.filter((e) => e.id !== answer.id && depthOf(e) > 0 === kind && !isSentenceEntry(e) && !sameMeaning(e, answer));
  const options = chooseOptions(entries, answer, { count, rng, pool });
  return options && options.length >= 2 ? options : null;
}

// A card for an entry: one of its gaps, at random, and its word bank; null when it has none.
export function clozeCard(list, entry, { rng = Math.random, sentences = listSentences(list.entries) } = {}) {
  const entries = list.entries || [];
  const gap = pick(gapsOf(entries, entry, sentences), rng);
  if (!gap) return null;
  const answer = entries.find((e) => e.id === gap.answerId);
  const options = answer ? bankFor(entries, answer, { rng }) : null;
  if (!options) return null;
  return { listId: list.id, type: 'cloze', itemId: entry.id, from: gap.from, src: gap.src, start: gap.start, end: gap.end, options };
}

// What a card shows: its sentence split around the gap, the entry that fills the gap and the
// word bank, or null once the list has changed so that the card no longer makes sense (the
// sentence is gone, or the text in the gap is no longer one of the bank's words).
export function gapOnCard(entries, card) {
  const byId = new Map((entries || []).map((e) => [e.id, e]));
  const sentence = sentenceOf(byId.get(card.from), card.src);
  if (!sentence || !(card.end > card.start)) return null;
  const gap = sentence.text.slice(card.start, card.end);
  const options = (card.options || []).map((id) => byId.get(id)).filter(Boolean);
  const answer = options.find((o) => chineseChars(o.word || '') === gap);
  if (!gap || !answer) return null;
  return { ...sentence, before: sentence.text.slice(0, card.start), gap, after: sentence.text.slice(card.end), answer, options };
}
