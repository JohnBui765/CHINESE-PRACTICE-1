// The session engine: which entries make cards, the two directions, grading and saving.
// IndexedDB does not exist in Node, so the store falls back to memory, which is enough here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readText } from '../../js/core/extract.js';
import { withIds } from '../../js/core/lists.js';
import * as store from '../../js/data/store.js';
import { inScope, practiceEntries, hasSideB, buildCards, buildReviewCards, countDue, createSession, currentCard, answer, isFinished, summarize, commit, cardResolves, liveCards } from '../../js/screens/practice/session.js';

// A tiny localStorage for the session snapshot.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const LESSON = `# Bài 5
女朋友 | nǚ péngyou | girlfriend
> 女 | nǚ | woman
> 朋 | péng | friend
> 友 | yǒu → you | friend
哪 | nǎ | which
国
你好！ | Ní hǎo! | Hello!
`;

const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function makeList(id = 'L1') {
  return { id, name: 'Bài 5', rawText: LESSON, entries: withIds(readText(LESSON, 'x').entries) };
}

test('inScope: words are depth 0, characters depth > 0, all is everything', () => {
  assert.equal(inScope({ depth: 0 }, 'words'), true);
  assert.equal(inScope({ depth: 1 }, 'words'), false);
  assert.equal(inScope({ depth: 1 }, 'chars'), true);
  assert.equal(inScope({ depth: 0 }, 'chars'), false);
  assert.equal(inScope({ depth: 2 }, 'all'), true);
  assert.equal(inScope({}, 'words'), true, 'a missing depth is 0');
});

test('practiceEntries and hasSideB', () => {
  const list = makeList();
  assert.deepEqual(practiceEntries(list, 'words').map((e) => e.word), ['女朋友', '哪', '国', '你好！']);
  assert.deepEqual(practiceEntries(list, 'chars').map((e) => e.word), ['女', '朋', '友']);
  assert.equal(practiceEntries(list, 'all').length, 7);
  assert.equal(hasSideB(list.entries.find((e) => e.word === '国')), false);
  assert.equal(hasSideB(list.entries.find((e) => e.word === '哪')), true);
});

test('buildCards: recall shows every entry in scope, recallReverse only those with pinyin or meaning', () => {
  const list = makeList();
  const rng = seq([0.5]);
  const recall = buildCards(list, 'recall', { scope: 'words', rng });
  assert.equal(recall.length, 4);
  assert.ok(recall.every((c) => c.type === 'recall' && c.dir === 'word' && c.listId === 'L1'));
  const reverse = buildCards(list, 'recallReverse', { scope: 'words', rng });
  assert.equal(reverse.length, 3, '国 has no pinyin or meaning');
  assert.ok(reverse.every((c) => c.dir === 'meaning'));
  const chars = buildCards(list, 'recall', { scope: 'chars', rng });
  assert.equal(chars.length, 3);
  const only = buildCards(list, 'recall', { scope: 'all', itemIds: [list.entries[1].id], rng });
  assert.deepEqual(only.map((c) => c.itemId), [list.entries[1].id]);
});

test('a session re-asks a missed card (up to 2 extra times), summarises first-try outcomes and saves progress', async () => {
  const list = await store.saveList(makeList('L2'));
  const cards = buildCards(list, 'recall', { scope: 'words', rng: seq([0.1]) });
  const session = createSession({ mode: 'recall', listId: list.id, title: list.name, cards });
  assert.equal(session.originalCount, 4);
  const first = currentCard(session);
  answer(session, { correct: false });
  assert.equal(session.queue.length, 5, 'the missed card is queued again');
  while (!isFinished(session)) answer(session, { correct: true });
  const sum = summarize(session);
  assert.equal(sum.total, 4);
  assert.equal(sum.right, 3);
  assert.equal(sum.wrong, 1);
  assert.equal(sum.accuracy, 75);
  assert.deepEqual(sum.missed, [{ itemId: first.itemId, listId: list.id }]);

  const now = Date.now();
  await commit(session, now);
  const progress = await store.getProgressForList(list.id);
  assert.equal(progress.size, 4);
  assert.equal(progress.get(first.itemId).box, 1, 'a missed word goes to box 1');
  assert.equal(progress.get(first.itemId).due, now, 'and is due again right away');
  const other = cards.find((c) => c.itemId !== first.itemId);
  assert.equal(progress.get(other.itemId).box, 1, 'a new word known once goes to box 1');
  assert.ok(progress.get(other.itemId).due > now, 'and comes back tomorrow');
  const saved = await store.getList(list.id);
  assert.equal(saved.lastPracticedAt, now);
  assert.equal((await store.getHistory({ listId: list.id })).length, 1);
  assert.equal(localStorage.getItem('chinese-practice-1.session'), null, 'the snapshot is cleared');
});

test('review cards: practised entries come back whatever the scope; new ones only inside it', async () => {
  const list = await store.saveList(makeList('L3'));
  const char = list.entries.find((e) => e.word === '女');
  // Practise one character once, then miss it: it is due now.
  const session = createSession({ mode: 'recall', listId: list.id, cards: [{ listId: list.id, type: 'recall', itemId: char.id, dir: 'word' }] });
  answer(session, { correct: false });
  const now = Date.now();
  await commit(session, now);
  const { cards, totalDue } = await buildReviewCards({ limit: 50, now, rng: seq([0.9]), scope: 'words' });
  const mine = cards.filter((c) => c.listId === list.id);
  assert.ok(mine.some((c) => c.itemId === char.id), 'the practised character is in the review although the scope is words');
  assert.ok(!mine.some((c) => c.listId === list.id && list.entries.find((e) => e.id === c.itemId).word === '朋'), 'an unpractised character is not');
  assert.ok(totalDue >= mine.length);
  const counts = await countDue(now, { scope: 'words' });
  assert.ok(counts.due >= 1 && counts.fresh >= 4);
});

test('cardResolves and liveCards drop cards whose entry is gone', () => {
  const list = makeList('L4');
  const lists = new Map([[list.id, list]]);
  const good = { listId: 'L4', type: 'recall', itemId: list.entries[0].id, dir: 'word' };
  const gone = { listId: 'L4', type: 'recall', itemId: 'deleted', dir: 'word' };
  assert.equal(cardResolves(good, lists), true);
  assert.equal(cardResolves(gone, lists), false);
  assert.equal(cardResolves({ ...good, listId: 'nope' }, lists), false);
  const session = createSession({ mode: 'recall', cards: [gone, good] });
  assert.deepEqual(liveCards(session, lists), [{ ...good, retry: 0 }]);
});
