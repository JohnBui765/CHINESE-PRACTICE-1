// Fill the gap: where an entry is blanked, the word bank, and whether a saved card still makes sense.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readText } from '../../js/core/extract.js';
import { withIds } from '../../js/core/lists.js';
import { gapsOf, partSpans, bankFor, clozeCard, gapOnCard, sentenceOf } from '../../js/core/gaps.js';

const BAI7 = await readFile(new URL('../fixtures/bai7.txt', import.meta.url), 'utf8');
const listOf = (text, id = 'L') => ({ id, name: 'x', entries: withIds(readText(text, 'x').entries) });
const bai7 = listOf(BAI7);
const find = (list, word, depth = 0) => list.entries.find((e) => e.word === word && (Number(e.depth) || 0) === depth);
// A gap as the learner sees it: the sentence with ［ ］ in place of the gap.
const show = (list, g) => {
  const text = sentenceOf(list.entries.find((e) => e.id === g.from), g.src).text;
  return `${text.slice(0, g.start)}［ ］${text.slice(g.end)}`;
};
const shown = (list, entry) => gapsOf(list.entries, entry).map((g) => show(list, g));

// Sentences of a textbook text: each sentence with its chunks ("> " lines).
const SENTENCES = listOf(`# Bài 1
你好！我是王明。 | Ní hǎo! Wǒ shì Wáng Míng. | Hello! I'm Wang Ming.
> 你好 | nǐ hǎo → ní hǎo | hello
> 我 | wǒ | I
> 是 | shì | to be
> 王明 | Wáng Míng | Wang Ming (name)
不客气。 | Bú kèqi. | You're welcome.
> 不客气 | bù kèqi → bú kèqi | you're welcome
你去哪儿？ | Nǐ qù nǎr? | Where are you going?
> 你 | nǐ | you
> 去 | qù | to go
> 哪儿 | nǎr | where
`);

test('a word is blanked in its own sentence; a word of 2+ characters also in the other sentences', () => {
  assert.deepEqual(shown(bai7, find(bai7, '去')), ['你［ ］哪儿？'], 'a single character: its own sentence only (去 is also in 明天我去超市。)');
  assert.deepEqual(shown(bai7, find(bai7, '哪儿')).sort(), ['你去［ ］？', '你在［ ］？', '超市在［ ］？'].sort());
  assert.deepEqual(shown(bai7, find(bai7, '号')), ['我是五［ ］。']);
});

test('a character under a word is blanked inside its word, wherever the word is', () => {
  assert.deepEqual(shown(bai7, find(bai7, '超', 1)), ['［ ］市在哪儿？', '明天我去［ ］市。']);
  assert.deepEqual(shown(bai7, find(bai7, '天', 1)), ['明［ ］我去超市。'], '天 is blanked inside 明天, never on its own');
  // 姐姐 has two 姐 lines: the first one is the first 姐.
  const list = listOf('姐姐 | jiějie | older sister\n= 我姐姐是老师。 | Wǒ jiějie shì lǎoshī. | My older sister is a teacher.\n> 姐 | jiě | older sister\n> 姐 | jiě → jie | older sister');
  const [first, second] = list.entries.filter((e) => e.word === '姐');
  assert.deepEqual(shown(list, first), ['我［ ］姐是老师。']);
  assert.deepEqual(shown(list, second), ['我姐［ ］是老师。']);
});

test('sentences: their chunks are found in order, stepping over punctuation', () => {
  const sentence = find(SENTENCES, '你好！我是王明。');
  const parts = SENTENCES.entries.filter((e) => e.depth === 1).slice(0, 4);
  assert.deepEqual(partSpans(sentence.word, parts).map((s) => [s.part.word, s.start, s.end]), [['你好', 0, 2], ['我', 3, 4], ['是', 4, 5], ['王明', 5, 7]]);
  // Out of order: still found; not in the sentence: left out.
  const loose = partSpans('你去哪儿？', [{ word: '哪儿' }, { word: '你' }, { word: '他' }]);
  assert.deepEqual(loose.map((s) => [s.part.word, s.start]), [['哪儿', 2], ['你', 0]]);
});

test('Words: a sentence gets one of its chunks, never a chunk that is the whole sentence; Characters: each chunk in its sentence', () => {
  const sentence = find(SENTENCES, '你好！我是王明。');
  assert.deepEqual(shown(SENTENCES, sentence), ['［ ］！我是王明。', '你好！［ ］是王明。', '你好！我［ ］王明。', '你好！我是［ ］。']);
  assert.ok(gapsOf(SENTENCES.entries, sentence).every((g) => g.answerId !== sentence.id), 'the answer is the chunk');
  assert.deepEqual(shown(SENTENCES, find(SENTENCES, '不客气。')), [], 'its only chunk is the whole sentence');
  assert.deepEqual(shown(SENTENCES, find(SENTENCES, '我', 1)), ['你好！［ ］是王明。']);
  assert.deepEqual(shown(SENTENCES, find(SENTENCES, '不客气', 1)), ['［ ］。']);
});

test('the word bank: up to 8 of the same kind, the answer among them, no sentence, no word that means the same', () => {
  const niunai = find(bai7, '牛奶');
  const ids = bankFor(bai7.entries, niunai, { rng: () => 0.3 });
  assert.equal(ids.length, 8);
  assert.ok(ids.includes(niunai.id));
  assert.ok(ids.every((id) => bai7.entries.find((e) => e.id === id).depth === 0), 'words with words');
  const chao = find(bai7, '超', 1);
  assert.ok(bankFor(bai7.entries, chao).every((id) => bai7.entries.find((e) => e.id === id).depth === 1), 'characters with characters');
  const milk = listOf('牛奶 | niúnǎi | milk\n奶 | nǎi | milk\n水 | shuǐ | water\n茶 | chá | tea\n你好！ | Ní hǎo! | Hello!');
  const bank = bankFor(milk.entries, find(milk, '牛奶')).map((id) => milk.entries.find((e) => e.id === id).word);
  assert.deepEqual(bank.sort(), ['水', '牛奶', '茶'].sort(), '奶 means the same; 你好！ is a sentence');
  assert.equal(bankFor(listOf('牛奶 | niúnǎi | milk').entries, find(listOf('牛奶 | niúnǎi | milk'), '牛奶')), null, 'nothing to choose from');
});

test('a card remembers its gap and bank, and stops showing once its sentence changes', () => {
  const dongxi = find(bai7, '东西');
  const card = clozeCard(bai7, dongxi, { rng: () => 0.5 });
  assert.deepEqual([card.type, card.itemId, card.from, card.src, card.start, card.end], ['cloze', dongxi.id, dongxi.id, 'example', 3, 5]);
  const gap = gapOnCard(bai7.entries, card);
  assert.deepEqual([gap.before, gap.gap, gap.after, gap.english], ['我去买', '东西', '。', "I'm going shopping."]);
  assert.equal(gap.answer.id, dongxi.id);
  const edited = bai7.entries.map((e) => (e.id === dongxi.id ? { ...e, example: '我买东西。' } : e));
  assert.equal(gapOnCard(edited, card), null, 'the gap no longer holds one of the bank words');
  assert.equal(gapOnCard(bai7.entries.filter((e) => e.id !== dongxi.id), card), null, 'the sentence is gone');
  assert.equal(clozeCard(listOf('国 | guó | country\n家 | jiā | home'), { id: 'x', word: '国' }), null, 'no sentence, no card');
});
