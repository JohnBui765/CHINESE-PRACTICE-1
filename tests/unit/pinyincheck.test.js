// Typed pinyin: tone marks on syllables, the tone bar's edit, and grading an answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllableParts, markSyllable, applyToneToLast, lettersOnly, toSyllables, gradePinyin } from '../../js/core/pinyincheck.js';

test('syllableParts reads tone marks, tone numbers and ü in its three spellings', () => {
  assert.deepEqual(syllableParts('nǐ'), { base: 'ni', tone: 3 });
  assert.deepEqual(syllableParts('ni3'), { base: 'ni', tone: 3 });
  assert.deepEqual(syllableParts('ma'), { base: 'ma', tone: 5 });
  assert.deepEqual(syllableParts('ma5'), { base: 'ma', tone: 5 });
  assert.deepEqual(syllableParts('ma0'), { base: 'ma', tone: 5 });
  assert.deepEqual(syllableParts('nǚ'), { base: 'nü', tone: 3 });
  assert.deepEqual(syllableParts('nv3'), { base: 'nü', tone: 3 });
  assert.deepEqual(syllableParts('nu:3'), { base: 'nü', tone: 3 });
  assert.deepEqual(syllableParts('Zhōng'), { base: 'zhong', tone: 1 });
  assert.deepEqual(syllableParts('ér'), { base: 'er', tone: 2 });
});

test('markSyllable puts the mark on the right vowel', () => {
  assert.equal(markSyllable('ni', 3), 'nǐ');
  assert.equal(markSyllable('hao', 3), 'hǎo'); // a wins
  assert.equal(markSyllable('xie', 4), 'xiè'); // e wins
  assert.equal(markSyllable('dou', 1), 'dōu'); // ou: on o
  assert.equal(markSyllable('liu', 2), 'liú'); // iu: on u
  assert.equal(markSyllable('gui', 4), 'guì'); // ui: on i
  assert.equal(markSyllable('nv', 3), 'nǚ');
  assert.equal(markSyllable('lüe', 4), 'lüè');
  assert.equal(markSyllable('nǐ', 2), 'ní', 'an old mark is replaced');
  assert.equal(markSyllab('ma', 5), 'ma');
  assert.equal(markSyllable('ni3', 1), 'nī', 'a tone number is replaced');
  assert.equal(markSyllable('zh', 1), 'zh', 'no vowel: unchanged');
});

function markSyllab(a, b) {
  return markSyllable(a, b);
}

test('applyToneToLast marks only the last syllable typed', () => {
  assert.equal(applyToneToLast('ni', 3), 'nǐ');
  assert.equal(applyToneToLast('nihao', 3), 'nihǎo');
  assert.equal(applyToneToLast('nǐhao', 3), 'nǐhǎo');
  assert.equal(applyToneToLast('ni hao', 3), 'ni hǎo');
  assert.equal(applyToneToLast('ni3', 2), 'ní');
  assert.equal(applyToneToLast('nv', 3), 'nǚ');
  assert.equal(applyToneToLast('nu:', 3), 'nǚ');
  assert.equal(applyToneToLast('mingtian', 1), 'mingtiān');
  assert.equal(applyToneToLast('xian', 1), 'xiān', 'the longest syllable at the end: xian, not an');
  assert.equal(applyToneToLast('nǐhǎo', 5), 'nǐhao', 'the neutral key removes the mark');
  assert.equal(applyToneToLast('', 3), '');
  assert.equal(applyToneToLast('123', 3), '123', 'digits alone: nothing to mark');
  assert.equal(applyToneToLast('Nǐ hǎo! ', 3), 'Nǐ hǎo! ', 'nothing to mark after punctuation');
});

test('lettersOnly and toSyllables', () => {
  assert.equal(lettersOnly('Nǐ hǎo!'), 'nihao');
  assert.equal(lettersOnly('nv3 nu:'), 'nünü');
  assert.deepEqual(toSyllables('nǐ hǎo', '你好'), [{ base: 'ni', tone: 3 }, { base: 'hao', tone: 3 }]);
  assert.deepEqual(toSyllables('Nǐ hǎo!', '你好'), [{ base: 'ni', tone: 3 }, { base: 'hao', tone: 3 }]);
  assert.deepEqual(toSyllables('nǎr', '哪儿'), [{ base: 'na', tone: 3 }, { base: 'er', tone: 2 }]);
  assert.deepEqual(toSyllables('nar3', '哪儿'), [{ base: 'na', tone: 3 }, { base: 'er', tone: 2 }]);
  assert.equal(toSyllables('nih', '你好'), null);
});

test('gradePinyin: right, close (tones) and wrong', () => {
  const nihao = { word: '你好！', pinyin: 'Ní hǎo!' };
  assert.equal(gradePinyin('ní hǎo', nihao).correct, true);
  assert.equal(gradePinyin('ni2hao3', nihao).correct, true);
  assert.equal(gradePinyin('níhǎo', nihao).correct, true);
  const noTones = gradePinyin('nihao', nihao);
  assert.equal(noTones.correct, false);
  assert.equal(noTones.close, true);
  assert.match(noTones.message, /add the tones/i);
  assert.equal(gradePinyin('nihao', nihao, { tonesRequired: false }).correct, true, 'tones not required: letters are enough');
  const wrongTones = gradePinyin('nǐ hào', nihao);
  assert.equal(wrongTones.correct, false);
  assert.equal(wrongTones.close, true);
  assert.match(wrongTones.message, /wrong tones/i);
  assert.equal(gradePinyin('nǐ hào', nihao, { tonesRequired: false }).correct, false, 'typed tones are always checked');
  const wrong = gradePinyin('ni men', nihao);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.close, false);
  assert.equal(gradePinyin('', nihao).correct, false);
  assert.equal(gradePinyin('ni hao', { word: '你好', pinyin: '' }).correct, false, 'no pinyin to check against');
});

test('gradePinyin accepts the pinyin as said, ü spellings and 儿 forms', () => {
  const you = { word: '友', pinyin: 'yǒu', said: 'you' };
  assert.equal(gradePinyin('yǒu', you).correct, true);
  assert.equal(gradePinyin('you', you).correct, true, 'the pinyin as said (neutral) is right too');
  assert.equal(gradePinyin('yóu', you).close, true);
  const nv = { word: '女', pinyin: 'nǚ' };
  assert.equal(gradePinyin('nv3', nv).correct, true);
  assert.equal(gradePinyin('nu:3', nv).correct, true);
  assert.equal(gradePinyin('nǚ', nv).correct, true);
  const nar = { word: '哪儿', pinyin: 'nǎr' };
  assert.equal(gradePinyin('nǎr', nar).correct, true);
  assert.equal(gradePinyin('nar3', nar).correct, true);
  assert.equal(gradePinyin('nǎ ér', nar).correct, true);
  const ming = { word: '明天', pinyin: 'míngtiān' };
  assert.equal(gradePinyin('ming2 tian1', ming).correct, true);
  assert.equal(gradePinyin('míngtiān', ming).correct, true);
  assert.equal(gradePinyin('mingtian', ming).close, true);
  // Letters right but cut wrongly (a missing apostrophe) is still "close", not wrong.
  const xian = { word: '西安', pinyin: "Xī'ān" };
  assert.equal(gradePinyin("xī'ān", xian).correct, true);
  assert.equal(gradePinyin('xi an', xian).close, true);
});
