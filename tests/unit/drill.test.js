// "Write it": the order of the writing steps and what a mistake changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDrill, currentStep, record, skipTracing, isDone, roundOf, summary, MAX_TRIES, WORD_TRIES } from '../../js/core/drill.js';

const kinds = (d) => d.queue.slice(d.index).map((s) => `${s.kind}${s.char === null ? '' : s.char}`);

test('a word of two characters: trace both, then each from memory, then the whole word', () => {
  const d = startDrill(2);
  assert.deepEqual(kinds(d), ['trace0', 'trace1', 'memory0', 'memory1', 'word']);
  assert.deepEqual(d.queue.map(roundOf), [1, 1, 2, 2, 3]);
  assert.equal(roundOf(null), 0);
});

test('one character: no whole-word step', () => {
  assert.deepEqual(kinds(startDrill(1)), ['trace0', 'memory0']);
  assert.deepEqual(kinds(startDrill(0)), ['trace0', 'memory0'], 'a bad count is one character');
  assert.deepEqual(kinds(startDrill(Number.NaN)), ['trace0', 'memory0']);
});

test('every write right the first time: done, perfect', () => {
  let d = startDrill(2);
  while (!isDone(d)) d = record(d, { clean: true });
  assert.equal(currentStep(d), null);
  const sum = summary(d);
  assert.equal(sum.perfect, true);
  assert.deepEqual(sum.chars, [
    { index: 0, tries: 1, clean: true },
    { index: 1, tries: 1, clean: true },
  ]);
  assert.deepEqual(sum.word, { tries: 1, clean: true });
  assert.equal(record(d, { clean: true }), d, 'recording after the end changes nothing');
});

test('tracing and copying move on whatever happens', () => {
  let d = startDrill(2);
  d = record(d, { clean: false });
  assert.deepEqual(kinds(d), ['trace1', 'memory0', 'memory1', 'word']);
});

test('a mistake from memory: copy it, then try again from memory', () => {
  let d = startDrill(2);
  d = record(record(d, { clean: true }), { clean: true }); // the two traces
  d = record(d, { clean: false }); // 1st character from memory, with a mistake
  assert.deepEqual(kinds(d), ['copy0', 'memory0', 'memory1', 'word']);
  assert.equal(roundOf(currentStep(d)), 2, 'copying is part of the from-memory round');
  d = record(d, { clean: false }); // the copy
  d = record(d, { clean: true }); // from memory again: right
  assert.deepEqual(kinds(d), ['memory1', 'word']);
  while (!isDone(d)) d = record(d, { clean: true });
  const sum = summary(d);
  assert.deepEqual(sum.chars[0], { index: 0, tries: 2, clean: true });
  assert.equal(sum.perfect, false, 'right in the end, but not the first time');
});

test(`after ${MAX_TRIES} tries from memory with mistakes, the drill moves on`, () => {
  let d = startDrill(1, { skipTrace: true });
  for (let i = 0; i < MAX_TRIES - 1; i++) {
    d = record(d, { clean: false }); // from memory, wrong
    assert.equal(currentStep(d).kind, 'copy');
    d = record(d); // the copy
  }
  d = record(d, { clean: false }); // the last try, wrong again
  assert.equal(isDone(d), true);
  assert.deepEqual(summary(d).chars[0], { index: 0, tries: MAX_TRIES, clean: false });
});

test(`the whole word gets ${WORD_TRIES} tries`, () => {
  let d = startDrill(2, { skipTrace: true });
  d = record(record(d, { clean: true }), { clean: true });
  assert.equal(currentStep(d).kind, 'word');
  d = record(d, { clean: false });
  assert.deepEqual(kinds(d), ['word'], 'once more');
  d = record(d, { clean: false });
  assert.equal(isDone(d), true);
  assert.deepEqual(summary(d).word, { tries: WORD_TRIES, clean: false });
});

test('"I know it" skips the tracing still to come', () => {
  let d = startDrill(3);
  assert.deepEqual(kinds(skipTracing(d)), ['memory0', 'memory1', 'memory2', 'word']);
  d = record(d, { clean: true }); // the 1st character was traced
  d = skipTracing(d);
  assert.equal(d.index, 1);
  assert.deepEqual(kinds(d), ['memory0', 'memory1', 'memory2', 'word']);
  assert.deepEqual(kinds(startDrill(2, { skipTrace: true })), ['memory0', 'memory1', 'word']);
});

test('record and skipTracing never change the drill they are given', () => {
  const d = startDrill(2);
  const before = JSON.stringify(d);
  record(d, { clean: false });
  skipTracing(d);
  let e = record(record(d, { clean: true }), { clean: true });
  record(e, { clean: false });
  assert.equal(JSON.stringify(d), before);
});
