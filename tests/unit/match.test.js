// Match the meanings: which entries, how they are dealt into boards, the retry board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readText } from '../../js/core/extract.js';
import { withIds } from '../../js/core/lists.js';
import { canMatch, clash, isPair, makeBoards, retryBoard } from '../../js/core/match.js';

const e = (id, word, meaning, depth = 0) => ({ id, word, meaning, depth });
// n entries with different characters and meanings.
const many = (n) => Array.from({ length: n }, (_, i) => e(`e${i}`, String.fromCharCode(0x4e00 + i * 7), `meaning ${i}`));
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('canMatch: a meaning and 1 to 6 Chinese characters', () => {
  assert.equal(canMatch(e('a', '不客气。', "you're welcome")), true, 'a short sentence is fine');
  assert.equal(canMatch(e('b', '我们一起去超市吧。', "let's go")), false, '8 characters');
  assert.equal(canMatch(e('c', '国', '')), false, 'no meaning');
});

test('boards of at most 7, as even as possible, every entry once, in lesson order', () => {
  const sizes = { 1: [], 2: [2], 7: [7], 8: [4, 4], 10: [5, 5], 13: [7, 6], 19: [7, 6, 6] };
  for (const [n, want] of Object.entries(sizes)) {
    const entries = many(Number(n));
    const boards = makeBoards(entries, { rng: seeded(7) });
    assert.deepEqual(boards.map((b) => b.length), want, `${n} entries`);
    assert.deepEqual(boards.flat().sort(), want.length ? entries.map((x) => x.id).sort() : []);
    for (const b of boards) assert.deepEqual(b, [...b].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1))), 'lesson order');
  }
});

test('clash: the same characters, or a meaning in common', () => {
  assert.equal(clash(e('a', '国', 'country'), e('b', '国', 'country', 1)), true);
  assert.equal(clash(e('a', '奶', 'milk', 1), e('b', '牛奶', 'milk')), true);
  assert.equal(clash(e('a', '想', 'to miss, to want'), e('b', '要', 'to want')), true);
  assert.equal(clash(e('a', '明天', 'tomorrow'), e('b', '东西', 'thing; stuff')), false);
  assert.equal(isPair(e('a', '明天', 'tomorrow'), e('a', '明天', 'tomorrow')), true);
  assert.equal(isPair(e('a', '奶', 'milk', 1), e('b', '牛奶', 'milk')), true, 'either is accepted when they had to share a board');
  assert.equal(isPair(e('a', '明天', 'tomorrow'), e('b', '东西', 'thing; stuff')), false);
});

test('Bài 3–4, everything: the four 国, 姐姐/姐/姐, 吗/呢 and 朋/友 never share a board', async () => {
  const text = await readFile(new URL('../fixtures/claude_reply_v2.txt', import.meta.url), 'utf8');
  const entries = withIds(readText(text, 'x').entries).filter(canMatch);
  assert.equal(entries.length, 59);
  for (let seed = 1; seed <= 20; seed++) {
    const boards = makeBoards(entries, { rng: seeded(seed) });
    assert.equal(boards.length, 9);
    for (const ids of boards) {
      const on = ids.map((id) => entries.find((x) => x.id === id));
      for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) assert.equal(clash(on[i], on[j]), false, `${on[i].word} / ${on[j].word}`);
    }
  }
});

test('the retry board: the missed entries, topped up to 4 from the same board, in its order', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const two = retryBoard(ids, ['b', 'd'], { rng: seeded(3) });
  assert.equal(two.length, 4);
  assert.ok(two.includes('b') && two.includes('d'));
  assert.deepEqual(two, ids.filter((id) => two.includes(id)), 'in the board order');
  assert.deepEqual(retryBoard(ids, ids), ids, 'all missed: all back');
  assert.deepEqual(retryBoard(['a', 'b', 'c'], ['c']), ['a', 'b', 'c'], 'a small board comes back whole');
});

test('"Practise mistakes": a board of one missed entry is topped up to 4 with entries that do not clash', () => {
  const missed = e('x', '牛奶', 'milk');
  const spare = [e('a', '奶', 'milk', 1), e('b', '水', 'water'), e('c', '茶', 'tea'), e('d', '去', 'to go'), e('f', '买', 'to buy')];
  const [board, ...rest] = makeBoards([missed], { rng: seeded(5), spare, lesson: [missed, ...spare] });
  assert.equal(rest.length, 0);
  assert.equal(board.length, 4);
  assert.ok(board.includes('x') && !board.includes('a'), '奶 also means milk');
  assert.deepEqual(makeBoards([missed]), [], 'one entry and nothing to top it up: no board');
});
