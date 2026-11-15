// Pick the characters: the options shown with the right word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseOptions } from '../../js/core/choose.js';

const e = (id, word, depth = 0) => ({ id, word, depth });
const entries = [e('a', '超市'), e('b', '市场'), e('c', '明天'), e('d', '牛奶'), e('e', '去'), e('f', '哪儿'), e('g', '超市'), e('h', '你好！')];
const rng = () => 0.42;

test('four options, the right one among them, the confusable words first', () => {
  const ids = chooseOptions(entries, entries[0], { rng });
  assert.equal(ids.length, 4);
  assert.ok(ids.includes('a'));
  assert.ok(ids.includes('b'), '市场 shares a character with 超市');
  assert.ok(!ids.includes('g'), 'the same text is never offered twice');
  assert.equal(new Set(ids).size, 4);
});

test('a smaller list gives fewer options; a lone word gives none', () => {
  assert.equal(chooseOptions([e('a', '超市'), e('b', '去')], e('a', '超市'), { rng }).length, 2);
  assert.equal(chooseOptions([e('a', '超市')], e('a', '超市'), { rng }), null);
  assert.equal(chooseOptions(entries, e('x', '！'), { rng }), null, 'no Chinese characters');
});

test('a pool limits where the other words come from', () => {
  const chars = [e('p', '超', 1), e('q', '市', 1), e('r', '明', 1)];
  const ids = chooseOptions([...entries, ...chars], chars[0], { rng, pool: chars });
  assert.deepEqual([...ids].sort(), ['p', 'q', 'r']);
});

test('the right word is not always in the same place', () => {
  const places = new Set();
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const ids = chooseOptions(entries, entries[0], { rng: () => ((n += 7919) % 1000) / 1000 });
    places.add(ids.indexOf('a'));
  }
  assert.ok(places.size > 1);
});
