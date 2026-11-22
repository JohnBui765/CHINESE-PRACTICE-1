// Finding a word: by characters, by pinyin with or without tones, or by English; one result per
// word across lists, best matches first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readText } from '../../js/core/extract.js';
import { withIds, fold, pinyinLetters, matchEntry, searchWords } from '../../js/core/lists.js';

const e = (word, pinyin = '', meaning = '', extra = {}) => ({ id: word, word, pinyin, meaning, depth: 0, ...extra });

test('fold and pinyinLetters ignore tones, case, spaces, apostrophes and tone numbers', () => {
  assert.equal(fold('  Nǐ   Hǎo '), 'ni hao');
  assert.equal(pinyinLetters('Nǐ hǎo'), 'nihao');
  assert.equal(pinyinLetters('ni3 hao3'), 'nihao');
  assert.equal(pinyinLetters("Xī'ān"), 'xian');
  assert.equal(pinyinLetters('nǚ'), 'nu');
  assert.equal(pinyinLetters('nv3'), 'nu', 'v is ü');
  assert.equal(pinyinLetters('lvse'), 'luse');
  assert.equal(pinyinLetters('lu:3'), 'lu', 'u: is ü');
  assert.equal(pinyinLetters('TV'), 'tv', 'v is ü only after n or l');
});

test('characters: exact, then at the start, then inside', () => {
  const chaoshi = e('超市', 'chāoshì', 'supermarket');
  assert.equal(matchEntry(chaoshi, '超市'), 0);
  assert.equal(matchEntry(chaoshi, '超'), 1);
  assert.equal(matchEntry(chaoshi, '市'), 2);
  assert.equal(matchEntry(chaoshi, '牛'), -1);
  assert.equal(matchEntry(e('你好！', 'Ní hǎo!', 'Hello!'), '你好'), 0, 'punctuation does not count');
});

test('pinyin: with or without tones, tone numbers, the pinyin as said', () => {
  const chaoshi = e('超市', 'chāoshì', 'supermarket');
  assert.equal(matchEntry(chaoshi, 'chāoshì'), 0);
  assert.equal(matchEntry(chaoshi, 'chaoshi'), 0);
  assert.equal(matchEntry(chaoshi, 'chao1 shi4'), 0);
  assert.equal(matchEntry(chaoshi, 'chao'), 1);
  assert.equal(matchEntry(chaoshi, 'shi'), 2, 'inside, three letters or more');
  assert.equal(matchEntry(chaoshi, 'hi'), -1, 'two letters inside are too many matches');
  assert.equal(matchEntry(e('女', 'nǚ', 'woman'), 'nv'), 0);
  assert.equal(matchEntry(e('西', 'xī', 'west', { said: 'xi' }), 'xi'), 0);
});

test('meaning: a whole meaning ("to" left out), the start of a word, or inside', () => {
  const qu = e('去', 'qù', 'to go');
  assert.equal(matchEntry(qu, 'to go'), 0);
  assert.equal(matchEntry(qu, 'go'), 0);
  assert.equal(matchEntry(qu, 'Go'), 0, 'any case');
  const shi = e('市', 'shì', 'city; market');
  assert.equal(matchEntry(shi, 'market'), 0, 'one of several meanings');
  assert.equal(matchEntry(shi, 'mar'), 1);
  assert.equal(matchEntry(e('超市', 'chāoshì', 'supermarket'), 'market'), 2);
  assert.equal(matchEntry(e('本', 'běn', '(measure word for books)'), 'books'), 1, 'brackets do not get in the way');
  assert.equal(matchEntry(qu, 'xyz'), -1);
  assert.equal(matchEntry(qu, '   '), -1, 'nothing typed');
  assert.equal(matchEntry(null, 'go'), -1);
});

async function fixtureLists() {
  const read = async (name, file) => ({ id: name, name, entries: withIds(readText(await readFile(new URL(`../fixtures/${file}`, import.meta.url), 'utf8'), name).entries) });
  return [await read('Bài 7', 'bai7.txt'), await read('Bài 5', 'claude_reply_v2.txt')];
}

test('searchWords: best first, then the order of the lists and of the lesson', async () => {
  const lists = await fixtureLists();
  assert.deepEqual(searchWords(lists, 'chao').map((r) => r.word), ['超', '超市'], '超 is chāo exactly, 超市 starts with it');
  assert.deepEqual(searchWords(lists, 'milk').map((r) => r.word), ['牛奶', '奶']);
  assert.deepEqual(searchWords(lists, 'zzz'), []);
  assert.deepEqual(searchWords(lists, ''), []);
});

test('searchWords: a word in several lists, or several times in one, is one result', async () => {
  const lists = await fixtureLists();
  const xiang = searchWords(lists, '想');
  assert.equal(xiang.length, 1);
  assert.deepEqual(xiang[0].lists.map((l) => l.name), ['Bài 7', 'Bài 5']);
  assert.equal(xiang[0].list.name, 'Bài 7', 'the entry shown is from the first list');
  const guo = searchWords(lists, 'guo');
  assert.equal(guo.filter((r) => r.word === '国').length, 1, '国 is a word and is listed under 中国, 法国 and 泰国');
  assert.equal(guo[0].word, '国');
  assert.equal(guo[0].entry.depth, 0, 'the word itself, not one of the characters under 中国');
});

test('searchWords: a character with two readings gives two results; English with a v stays English', () => {
  const list = { id: 'L', name: 'Mixed', entries: [e('行', 'xíng', 'to walk; OK'), e('行', 'háng', 'row; line'), e('图', 'tú', 'picture'), e('电视', 'diànshì', 'TV')] };
  const xing = searchWords([list], '行');
  assert.deepEqual(xing.map((r) => r.entry.pinyin), ['xíng', 'háng']);
  assert.deepEqual(searchWords([list], 'tv').map((r) => r.word), ['电视'], 'not 图 tú');
});

test('searchWords: at most `limit` results', async () => {
  const lists = await fixtureLists();
  assert.equal(searchWords(lists, 'a', { limit: 3 }).length, 3);
});
