// Voice choice: Apple ships basic and downloaded (Enhanced/Premium) copies of a voice under the
// same name; only voiceURI tells them apart. Chinese voices only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceQuality, voiceName, voiceRegion, rankVoices, bestVoice, isChinese } from '../../js/ui/speech.js';

const v = (voiceURI, name, lang = 'zh-CN', localService = true) => ({ voiceURI, name, lang, localService });

// Roughly what iOS reports with the built-in Tingting and two downloaded voices.
const IOS = [
  v('com.apple.voice.compact.zh-CN.Tingting', 'Tingting'),
  v('com.apple.voice.compact.zh-TW.Meijia', 'Meijia', 'zh-TW'),
  v('com.apple.voice.compact.zh-HK.Sinji', 'Sinji', 'zh-HK'),
  v('com.apple.eloquence.zh-CN.Eddy', 'Eddy'),
  v('com.apple.voice.enhanced.zh-CN.Tingting', 'Tingting'),
  v('com.apple.voice.premium.zh-CN.Yushu', 'Yushu'),
];

test('isChinese recognises the Chinese language tags', () => {
  for (const lang of ['zh-CN', 'zh_TW', 'zh-HK', 'zh', 'cmn-Hans-CN', 'yue-HK']) assert.equal(isChinese(lang), true, lang);
  for (const lang of ['en-US', 'ja-JP', 'ko-KR', '']) assert.equal(isChinese(lang), false, lang);
});

test('quality is read from the voice id, not only the name', () => {
  assert.equal(voiceQuality(IOS[0]), 'default');
  assert.equal(voiceQuality(IOS[4]), 'enhanced');
  assert.equal(voiceQuality(IOS[5]), 'premium');
  assert.equal(voiceQuality(IOS[3]), 'novelty');
  assert.equal(voiceQuality(v('com.apple.ttsbundle.Ting-Ting-premium', 'Ting-Ting')), 'enhanced'); // older iOS naming
  assert.equal(voiceQuality(v('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'Microsoft Xiaoxiao Online (Natural)')), 'premium');
});

test('automatic choice prefers Premium, then Enhanced, then mainland Mandarin', () => {
  assert.equal(bestVoice(IOS).voiceURI, 'com.apple.voice.premium.zh-CN.Yushu');
  const noPremium = IOS.filter((x) => !x.voiceURI.includes('premium'));
  assert.equal(bestVoice(noPremium).voiceURI, 'com.apple.voice.enhanced.zh-CN.Tingting');
  const basicOnly = IOS.slice(0, 3);
  assert.equal(bestVoice(basicOnly).voiceURI, 'com.apple.voice.compact.zh-CN.Tingting');
});

test('a saved basic voice is upgraded once its Enhanced copy is downloaded', () => {
  assert.equal(bestVoice(IOS, 'com.apple.voice.compact.zh-CN.Tingting').voiceURI, 'com.apple.voice.enhanced.zh-CN.Tingting');
  assert.equal(bestVoice(IOS, 'com.apple.voice.compact.zh-TW.Meijia').voiceURI, 'com.apple.voice.compact.zh-TW.Meijia');
  assert.equal(bestVoice(IOS, 'gone').voiceURI, 'com.apple.voice.premium.zh-CN.Yushu');
});

test('ranking hides novelty voices and duplicates; names and regions for display', () => {
  const ranked = rankVoices([...IOS, IOS[0]]);
  assert.ok(!ranked.some((x) => voiceQuality(x) === 'novelty'));
  assert.equal(ranked.length, new Set(ranked.map((x) => x.voiceURI)).size);
  assert.equal(voiceName(v('x', 'Tingting (Enhanced)')), 'Tingting');
  assert.equal(voiceRegion(IOS[0]), 'Mainland Mandarin');
  assert.equal(voiceRegion(IOS[1]), 'Taiwan Mandarin');
  assert.equal(voiceRegion(IOS[2]), 'Cantonese (Hong Kong)');
  assert.equal(bestVoice([]), null);
});
