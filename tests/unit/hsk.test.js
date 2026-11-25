// The built-in HSK 1-3 dictionary: its reader, how a list's word finds its HSK entry, and the
// shipped files themselves (every word with a reading, a meaning and three good sentences).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readHsk, hskMatches } from '../../js/core/hsk.js';
import { boxText, chineseChars, EXAMPLE_MAX_BOXES } from '../../js/core/extract.js';
import { toSyllables } from '../../js/core/pinyincheck.js';

const SAMPLE = `# HSK 1
爱 | ài | to love
= 我爱妈妈。 | Wǒ ài māma. | I love my mom.
= 你爱吃什么？ | Nǐ ài chī shénme? | What do you like to eat? ?
= 我们都很爱这个家。 | Wǒmen dōu hěn ài zhège jiā. | We all really love this home.

还 | hái | still; also ?
= 他还没来。 | Tā hái méi lái. | He hasn't come yet.
还 | huán | to give back
= 我明天还你钱。 | Wǒ míngtiān huán nǐ qián. | I'll pay you back tomorrow.
`;

test('readHsk reads the words, their sentences and the " ?" flags', () => {
  const entries = readHsk(SAMPLE, 1);
  assert.deepEqual(
    entries.map((e) => [e.id, e.word, e.pinyin, e.meaning, e.hsk, e.unsure, e.examples.length]),
    [
      ['hsk1-1', '爱', 'ài', 'to love', 1, false, 3],
      ['hsk1-2', '还', 'hái', 'still; also', 1, true, 1],
      ['hsk1-3', '还', 'huán', 'to give back', 1, false, 1],
    ],
  );
  const [ai] = entries;
  assert.deepEqual(ai.examples[1], { text: '你爱吃什么？', pinyin: 'Nǐ ài chī shénme?', meaning: 'What do you like to eat?', unsure: true });
  assert.equal(ai.example, '我爱妈妈。', "the first sentence is also the entry's example");
  assert.equal(ai.examplePinyin, 'Wǒ ài māma.');
  assert.equal(ai.depth, 0);
  assert.deepEqual(readHsk('= 你好。 | Nǐ hǎo. | Hello.\n', 2), [], 'a sentence with no word above it is skipped');
});

test('hskMatches finds the same word with the same reading', () => {
  const entries = readHsk(SAMPLE, 1);
  const byWord = new Map([['爱', [entries[0]]], ['还', [entries[1], entries[2]]]]);
  const ids = (entry) => hskMatches(entry, byWord).map((e) => e.id);
  assert.deepEqual(ids({ word: '还', pinyin: 'hái' }), ['hsk1-2']);
  assert.deepEqual(ids({ word: '还', pinyin: 'huan2' }), ['hsk1-3'], 'tone numbers: the same letters');
  assert.deepEqual(ids({ word: '还', pinyin: '' }), ['hsk1-2', 'hsk1-3'], 'no pinyin: every reading');
  assert.deepEqual(ids({ word: '爱', pinyin: 'ǎi' }), ['hsk1-1'], 'a wrong tone still finds the word');
  assert.deepEqual(ids({ word: '爱人', pinyin: 'àiren' }), []);
});

// One syllable per character, like toSyllables(), but a 儿 inside the sentence may also be an
// r-ending (我有点儿忙 Wǒ yóudiǎnr máng), not only a 儿 at the end: each r-ending gets its own
// syllable ér first ("yóudiǎnr" -> "yóudiǎn ér"), so the syllables follow the characters.
function sentenceSyllables(py, chars) {
  const direct = toSyllables(py, chars);
  if (direct || ![...chars].slice(1).includes('儿')) return direct;
  const text = String(py).normalize('NFC');
  const spaced = text.replace(/[^\s.,!?;:'’-]+/g, (w) => {
    const plain = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return plain !== 'er' && /[aeioun]r$/.test(plain) ? `${w.slice(0, -1)} ér` : w;
  });
  return spaced === text ? null : toSyllables(spaced, chars);
}

test('sentenceSyllables finds an r-ending inside a sentence', () => {
  const bases = (py, zh) => sentenceSyllables(py, zh)?.map((s) => s.base + s.tone).join(' ');
  assert.equal(bases('Wó nǚ\'ér yóudiǎnr máng.', '我女儿有点儿忙'), 'wo2 nü3 er2 you2 dian3 er2 mang2');
  assert.equal(bases('Nǐ qù nǎr?', '你去哪儿'), 'ni3 qu4 na3 er2');
  assert.equal(bases('Wǒ yǒu èr ge.', '我有二个'), 'wo3 you3 er4 ge5');
  assert.equal(sentenceSyllables('Wǒ hěn hǎo.', '我很好吗'), null);
});

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const hanSet = async (path) => new Set([...(await read(path))].filter((c) => /\p{Script=Han}/u.test(c)));
const ENDS = { '。': '.', '？': '?', '！': '!' };

test('the HSK files: every word has a reading, a meaning and three good sentences', async () => {
  const common = await hanSet('data/common3500.txt');
  const strokes = await hanSet('data/stroke-chars.txt');
  const sentences = new Map();
  const problems = [];
  let total = 0;
  for (const level of [1, 2, 3]) {
    const entries = readHsk(await read(`data/hsk/hsk${level}.txt`), level);
    assert.ok(entries.length > 100, `HSK ${level} has its words`);
    total += entries.length;
    const readings = new Set();
    for (const e of entries) {
      const at = `HSK ${level} ${e.word}`;
      if (chineseChars(e.word) !== e.word) problems.push(`${at}: not only Chinese characters`);
      if (!toSyllables(e.pinyin, e.word) || /\d/.test(e.pinyin)) problems.push(`${at}: pinyin "${e.pinyin}"`);
      if (!e.meaning || /\p{Script=Han}/u.test(e.meaning)) problems.push(`${at}: meaning`);
      if (readings.has(`${e.word}|${e.pinyin}`)) problems.push(`${at}: the same reading twice`);
      readings.add(`${e.word}|${e.pinyin}`);
      for (const ch of e.word) if (!strokes.has(ch)) problems.push(`${at}: no stroke data for ${ch}`);
      if (e.examples.length !== 3) problems.push(`${at}: ${e.examples.length} sentences`);
      for (const x of e.examples) {
        const where = `${at} ${x.text}`;
        if (boxText(x.text) !== x.text) problems.push(`${where}: not only Chinese characters and punctuation`);
        if ([...x.text].length > EXAMPLE_MAX_BOXES) problems.push(`${where}: more than ${EXAMPLE_MAX_BOXES} boxes`);
        if (!ENDS[x.text.slice(-1)] || !x.pinyin.endsWith(ENDS[x.text.slice(-1)])) problems.push(`${where}: end mark`);
        if (!x.text.includes(e.word)) problems.push(`${where}: without ${e.word}`);
        if (!sentenceSyllables(x.pinyin, chineseChars(x.text)) || /\d/.test(x.pinyin)) problems.push(`${where}: pinyin "${x.pinyin}"`);
        if (!x.meaning) problems.push(`${where}: no English`);
        const rare = [...chineseChars(x.text)].filter((ch) => !common.has(ch));
        if (rare.length) problems.push(`${where}: uncommon ${rare.join('')}`);
        if (sentences.has(x.text)) problems.push(`${where}: also under ${sentences.get(x.text)}`);
        sentences.set(x.text, at);
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(total >= 978, `${total} entries: every word of HSK 1-3`);
});
