// The stroke-order data and its helpers: block files, coverage of the 3,500 common characters,
// the record format, which words the writing mode can quiz, and the diagram geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { blockName, blockFile, writableChars, glyphTransform, glyphPoint, diagramSteps, dataProblem, WRITE_MAX_CHARS } from '../../js/core/strokes.js';

const root = new URL('../../', import.meta.url);
const lines = async (rel) => (await readFile(new URL(rel, root), 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

test('blockName and blockFile: one file per 256 code points', () => {
  assert.equal(blockName('一'), '4e'); // U+4E00
  assert.equal(blockName('龙'), '9f'); // U+9F99
  assert.equal(blockName('我'), '62'); // U+6211
  assert.equal(blockFile('我'), 'data/strokes/62.json');
});

test('every common character has stroke data, and every listed character is in a block file', async () => {
  const common = await lines('data/common3500.txt');
  const listed = new Set(await lines('data/stroke-chars.txt'));
  const missing = common.filter((c) => !listed.has(c));
  assert.deepEqual(missing, [], 'common characters without stroke data');
  const files = (await readdir(new URL('data/strokes/', root))).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 50, `block files: ${files.length}`);
  let count = 0;
  for (const f of files) {
    const block = JSON.parse(await readFile(new URL(`data/strokes/${f}`, root), 'utf8'));
    for (const [ch, record] of Object.entries(block)) {
      assert.equal(`${blockName(ch)}.json`, f, `${ch} is in the right file`);
      assert.equal(dataProblem(record), '', `${ch}: ${dataProblem(record)}`);
      assert.ok(listed.has(ch), `${ch} is listed`);
      count += 1;
    }
  }
  assert.equal(count, listed.size);
  assert.equal(listed.size, 3500);
});

test('the data of a known character looks right', async () => {
  const block = JSON.parse(await readFile(new URL('data/strokes/62.json', root), 'utf8'));
  const wo = block['我'];
  assert.equal(wo.s.length, 7, '我 has 7 strokes');
  assert.equal(wo.m.length, 7);
  for (const m of wo.m) for (const [x, y] of m) assert.ok(x >= -100 && x <= 1124 && y >= -224 && y <= 1000, `point ${x},${y} is inside the 1024 box`);
});

test('dataProblem rejects bad records', () => {
  assert.equal(dataProblem({ s: ['M 1 2 L 3 4'], m: [[[1, 2], [3, 4]]] }), '');
  assert.notEqual(dataProblem(null), '');
  assert.notEqual(dataProblem({ s: [], m: [] }), '');
  assert.notEqual(dataProblem({ s: ['M 1 2'], m: [] }), '');
  assert.notEqual(dataProblem({ s: ['x'], m: [[[1, 2], [3, 4]]] }), '');
  assert.notEqual(dataProblem({ s: ['M 1 2'], m: [[[1.5, 2], [3, 4]]] }), '');
});

test('writableChars: 1 to 4 Chinese characters, all with data; punctuation ignored', () => {
  const set = new Set(['你', '好', '女', '朋', '友']);
  assert.deepEqual(writableChars('你好', set), ['你', '好']);
  assert.deepEqual(writableChars('你好！', set), ['你', '好'], 'a sentence entry of 2 characters can be written');
  assert.deepEqual(writableChars('女朋友', set), ['女', '朋', '友']);
  assert.equal(writableChars('国', set), null, 'no data');
  assert.equal(writableChars('你好你好你', set), null, `more than ${WRITE_MAX_CHARS} characters`);
  assert.equal(writableChars('', set), null);
  assert.equal(writableChars('你好', null), null);
});

test('glyphTransform and glyphPoint map the y-up data into a y-down square', () => {
  assert.equal(glyphTransform(1024), 'scale(1 -1) translate(0 -900)');
  assert.deepEqual(glyphPoint([0, 900], 100), [0, 0], 'the top-left of the data is the top-left of the square');
  assert.deepEqual(glyphPoint([1024, -124], 100), [100, 100], 'the bottom-right likewise');
  assert.deepEqual(glyphPoint([512, 388], 200), [100, 100], 'the centre');
});

test('diagramSteps: cell i shows strokes 0..i and numbers the newest at its start', () => {
  const data = { strokes: ['M a', 'M b', 'M c'], medians: [[[1, 1], [2, 2]], [[3, 3], [4, 4]], [[5, 5], [6, 6]]] };
  const steps = diagramSteps(data);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1], { index: 1, paths: ['M a', 'M b'], label: '2', at: [3, 3] });
  assert.deepEqual(steps[2].paths, ['M a', 'M b', 'M c']);
});
