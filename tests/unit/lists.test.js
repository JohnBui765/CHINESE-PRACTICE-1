// js/core/lists.js: ids that survive an edit, counts, parts, pinyin labels, the example
// underline and the character warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readText } from '../../js/core/extract.js';
import { withIds, counts, countLabel, partsOf, pinyinLabel, exampleUnderline, charWarnings, entryKey } from '../../js/core/lists.js';

const LESSON = `# Bài 5
女朋友 | nǚ péngyou | girlfriend
= 我有一个女朋友。 | Wó yǒu yí ge nǚ péngyou. | I have a girlfriend.
> 女 | nǚ | woman
> 朋 | péng | friend
> 友 | yǒu → you | friend
哪 | nǎ | which
你好！ | Ní hǎo! | Hello!
国
`;

test('withIds gives every entry a unique id', () => {
  const entries = withIds(readText(LESSON, 'x').entries);
  const ids = entries.map((e) => e.id);
  assert.equal(new Set(ids).size, entries.length);
  for (const id of ids) assert.equal(typeof id, 'string');
});

test('withIds keeps the id of an unchanged word (same word, same depth) when a list is edited', () => {
  const old = withIds(readText(LESSON, 'x').entries);
  const edited = LESSON.replace('哪 | nǎ | which', '哪 | nǎ | which\n吗 | ma | (question)');
  const fresh = withIds(readText(edited, 'x').entries, old);
  const byKey = (list) => new Map(list.map((e) => [entryKey(e), e.id]));
  const oldIds = byKey(old);
  for (const e of fresh) {
    if (e.word === '吗') assert.ok(!old.some((o) => o.id === e.id), 'a new word gets a new id');
    else assert.equal(e.id, oldIds.get(entryKey(e)), `${e.word} keeps its id`);
  }
  // The character 女 (depth 1) and a word 女 (depth 0) are different entries.
  assert.notEqual(entryKey({ word: '女', depth: 1 }), entryKey({ word: '女', depth: 0 }));
});

test('withIds never gives two entries the same old id', () => {
  const old = withIds([{ word: '十', depth: 0 }]);
  const fresh = withIds([{ word: '十', depth: 0 }, { word: '十', depth: 0 }], old);
  assert.equal(fresh[0].id, old[0].id);
  assert.notEqual(fresh[1].id, old[0].id);
});

test('counts and countLabel', () => {
  const list = { entries: readText(LESSON, 'x').entries };
  assert.deepEqual(counts(list), { words: 3, sentences: 1, chars: 3, total: 7 });
  assert.equal(countLabel(list), '3 words · 1 sentence · 3 characters');
  assert.equal(countLabel({ entries: [] }), 'empty');
});

test('partsOf lists the direct parts of an entry', () => {
  const entries = withIds(readText(LESSON, 'x').entries);
  const word = entries.find((e) => e.word === '女朋友');
  assert.deepEqual(partsOf(entries, word.id).map((e) => e.word), ['女', '朋', '友']);
  const na = entries.find((e) => e.word === '哪');
  assert.deepEqual(partsOf(entries, na.id), []);
  assert.deepEqual(partsOf(entries, 'nope'), []);
});

test('pinyinLabel shows the arrow only when the pinyin as said differs', () => {
  assert.equal(pinyinLabel({ pinyin: 'yǒu', said: 'you' }), 'yǒu → you');
  assert.equal(pinyinLabel({ pinyin: 'nǚ', said: '' }), 'nǚ');
  assert.equal(pinyinLabel({ pinyin: 'nǚ', said: 'nǚ' }), 'nǚ');
  assert.equal(pinyinLabel({ pinyin: '', said: '' }), '');
  assert.equal(pinyinLabel({}), '');
});

test('exampleUnderline finds the word in its example sentence', () => {
  assert.deepEqual(exampleUnderline({ word: '女朋友', example: '我有一个女朋友。' }), { start: 4, end: 7 });
  assert.equal(exampleUnderline({ word: '猫', example: '我喜欢狗。' }), null);
  assert.equal(exampleUnderline({ word: '猫', example: '' }), null);
  // A sentence entry: its Chinese characters are looked up, not its punctuation.
  assert.deepEqual(exampleUnderline({ word: '你好！', example: '你好！我是王明。' }), { start: 0, end: 2 });
});

test('charWarnings: rare characters are orange, characters missing from the fonts are red', () => {
  const sets = { common: new Set(['你', '好']), fonts: new Set(['你', '好', '龘']) };
  assert.deepEqual(charWarnings('你好', sets), { rare: [], missing: [] });
  assert.deepEqual(charWarnings('你龘', sets), { rare: ['龘'], missing: [] });
  assert.deepEqual(charWarnings('國', sets), { rare: [], missing: ['國'] });
  assert.deepEqual(charWarnings('你好！', sets), { rare: [], missing: [] }, 'punctuation is not a character');
  assert.deepEqual(charWarnings('你好', null), { rare: [], missing: [] }, 'no lists: no warnings');
});
