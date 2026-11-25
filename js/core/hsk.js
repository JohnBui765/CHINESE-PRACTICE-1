// The built-in HSK dictionary: the words of HSK 1-3 (2025 syllabus) in data/hsk/hsk1.txt ...
// hsk3.txt, each with its dictionary pinyin, a short meaning and three example sentences. The
// files use the lesson format of Hanzi Grid, with three "= " lines under each word:
//   爱 | ài | to love
//   = 我爱妈妈。 | Wǒ ài māma. | I love my mom.
// A line that ends in " ?" was flagged by the AI that wrote it ("not sure").
// readText() in extract.js keeps one sentence per word, so the dictionary has its own reader.
// Pure: no browser APIs (Node tests import this).
import { chineseChars } from './extract.js';
import { pinyinLetters } from './lists.js';

// "text ?" -> ["text", true]
function unsureMark(line) {
  const unsure = /\s\?\s*$/.test(line);
  return [unsure ? line.replace(/\s\?\s*$/, '').trim() : line.trim(), unsure];
}

const columns = (text) => text.split('|').map((c) => c.trim());

// Reads one level's file. Returns its entries in file order:
// { id, word, pinyin, meaning, depth: 0, hsk: level, unsure, examples: [{ text, pinyin, meaning, unsure }] }.
// The first sentence is also put in the fields every entry has (example, examplePinyin, ...), so
// a screen that shows one example sentence shows it too.
export function readHsk(text, level) {
  const entries = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('=')) {
      const last = entries[entries.length - 1];
      const [body, unsure] = unsureMark(line.replace(/^=\s*/, ''));
      const [zh = '', pinyin = '', meaning = ''] = columns(body);
      if (last && zh) last.examples.push({ text: zh, pinyin, meaning, unsure });
      continue;
    }
    const [body, unsure] = unsureMark(line);
    const [word = '', pinyin = '', meaning = ''] = columns(body);
    if (!chineseChars(word)) continue;
    entries.push({ id: `hsk${level}-${entries.length + 1}`, word, pinyin, meaning, depth: 0, hsk: level, unsure, examples: [] });
  }
  for (const entry of entries) {
    const first = entry.examples[0];
    if (first) Object.assign(entry, { example: first.text, examplePinyin: first.pinyin, exampleMeaning: first.meaning, exampleUnsure: first.unsure });
  }
  return entries;
}

// Pinyin with its tones, but without spaces, apostrophes or capitals: "Dōng xi" -> "dōngxi".
const toned = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s'’-]/g, '');

// The HSK entries of a word from the owner's lists (byWord: word -> HSK entries). When the word
// has pinyin, only the same reading: the same tones first, else the same letters, so 还 hái
// finds 还 hái but not 还 huán.
export function hskMatches(entry, byWord) {
  const found = byWord.get(chineseChars(entry?.word || '')) || [];
  if (!pinyinLetters(entry?.pinyin)) return found;
  const same = found.filter((h) => toned(h.pinyin) === toned(entry.pinyin));
  return same.length ? same : found.filter((h) => pinyinLetters(h.pinyin) === pinyinLetters(entry.pinyin));
}
