// Text-to-speech with the device's built-in Chinese voices (offline on iPhone). Taken from
// Vocab Studio and pointed at Chinese. speak() is synchronous on purpose: iOS only allows
// speech that starts inside a tap handler, so nothing may be awaited before calling it.

export const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let cachedVoices = [];

if (supported && window.speechSynthesis.addEventListener) {
  window.speechSynthesis.addEventListener('voiceschanged', () => loadVoices());
}

// Mandarin and Cantonese voices: zh-CN, zh-TW, zh-HK, cmn-Hans-CN, yue-HK…
export const isChinese = (lang) => /^(zh|cmn|yue)([-_]|$)/i.test(String(lang || ''));

function loadVoices() {
  if (!supported) return [];
  const all = window.speechSynthesis.getVoices() || [];
  cachedVoices = all.filter((v) => isChinese(v.lang));
  return cachedVoices;
}

// Every voice the browser offers, in every language, exactly as reported, for the Settings
// diagnostics. Waits up to 2 s for the list to load.
export function allVoicesRaw() {
  if (!supported) return Promise.resolve([]);
  const read = () => (window.speechSynthesis.getVoices() || []).map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, localService: v.localService, default: v.default }));
  const now = read();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(read());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 2000);
  });
}

// Resolves with the Chinese voices once the browser has loaded them (≤ 1.5 s).
export function chineseVoices() {
  if (!supported) return Promise.resolve([]);
  const now = loadVoices();
  if (now.length) return Promise.resolve(rankVoices(now));
  return new Promise((resolve) => {
    const done = () => resolve(rankVoices(loadVoices()));
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

// Apple ships several qualities of the same voice, often with the SAME name ("Tingting"): the
// quality is only in the voice id, e.g.
//   com.apple.voice.compact.zh-CN.Tingting    (basic)
//   com.apple.voice.enhanced.zh-CN.Tingting   (downloaded "Enhanced")
//   com.apple.voice.premium.zh-CN.Yushu       (downloaded "Premium")
//   com.apple.ttsbundle.Ting-Ting-premium     (older iOS name for Enhanced)
export const QUALITY_RANK = { premium: 3, enhanced: 2, default: 1, novelty: 0 };
export const QUALITY_LABEL = { premium: 'Premium', enhanced: 'Enhanced', default: 'Standard', novelty: 'Novelty' };

export function voiceQuality(v) {
  const uri = String(v?.voiceURI || '').toLowerCase();
  const name = String(v?.name || '').toLowerCase();
  const both = `${uri} ${name}`;
  if (uri.includes('eloquence')) return 'novelty';
  if (/ttsbundle\..*-premium/.test(uri)) return 'enhanced';
  if (/\bpremium\b|\.premium\.|neural|\(natural\)|\bnatural\b/.test(both)) return 'premium';
  if (/enhanced|siri/.test(both)) return 'enhanced';
  return 'default';
}

// "Tingting (Enhanced)" → "Tingting"
export function voiceName(v) {
  return String(v?.name || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'Voice';
}

// Where the voice's Chinese is from.
export function voiceRegion(v) {
  const lang = String(v?.lang || '').replace('_', '-');
  if (/^(zh-CN|cmn-Hans|cmn-CN|zh-Hans)/i.test(lang) || /^zh$/i.test(lang)) return 'Mainland Mandarin';
  if (/^(zh-TW|cmn-Hant|zh-Hant)/i.test(lang)) return 'Taiwan Mandarin';
  if (/^(zh-HK|yue)/i.test(lang)) return 'Cantonese (Hong Kong)';
  return lang || 'Chinese';
}

const PREFERRED = ['Tingting', 'Ting-Ting', 'Li-mu', 'Li-Mu', 'Limu', 'Yushu', 'Yu-shu', 'Xiaoxiao', 'Yunxi', 'Meijia', 'Mei-Jia', 'Sinji', 'Sin-ji', 'Huihui', 'Yaoyao', 'Kangkang', 'Google 普通话', 'Google 國語', 'Google 粤語'];

function score(v) {
  let s = QUALITY_RANK[voiceQuality(v)] * 100;
  const pref = PREFERRED.findIndex((n) => voiceName(v).toLowerCase().startsWith(n.toLowerCase()));
  if (pref >= 0) s += 30 - pref;
  const region = voiceRegion(v);
  if (region === 'Mainland Mandarin') s += 8;
  else if (region === 'Taiwan Mandarin') s += 4;
  else if (region.startsWith('Cantonese')) s += 1;
  if (v.localService) s += 2;
  return s;
}

// Best first; novelty voices left out; duplicates (same id) removed.
export function rankVoices(voices) {
  const seen = new Set();
  return voices
    .filter((v) => voiceQuality(v) !== 'novelty' && !seen.has(v.voiceURI) && seen.add(v.voiceURI))
    .sort((a, b) => score(b) - score(a));
}

// The voice to use: the saved one, upgraded to a better-quality copy of the same voice when
// one has been downloaded since; otherwise the best voice.
export function bestVoice(voices, voiceURI = '') {
  const ranked = rankVoices(voices);
  if (voiceURI) {
    const saved = voices.find((v) => v.voiceURI === voiceURI);
    if (saved) {
      const better = ranked.find((v) => voiceName(v) === voiceName(saved) && v.lang === saved.lang && QUALITY_RANK[voiceQuality(v)] > QUALITY_RANK[voiceQuality(saved)]);
      return better || saved;
    }
  }
  return ranked[0] || null;
}

function pickVoice(voiceURI) {
  const voices = cachedVoices.length ? cachedVoices : loadVoices();
  return bestVoice(voices, voiceURI);
}

// The voice that speak() will use with these settings (for the Settings screen).
export function currentVoice(voiceURI = '') {
  return pickVoice(voiceURI);
}

// Speaks Chinese text (characters, never pinyin). Returns false when speech is not possible.
export function speak(text, { rate = 0.9, voiceURI = '', lang = 'zh-CN', onEnd } = {}) {
  if (!supported) return false;
  const clean = String(text || '').trim();
  if (!clean) return false;
  const synth = window.speechSynthesis;
  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice(voiceURI);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = lang;
  }
  utter.rate = rate;
  if (onEnd) utter.onend = onEnd;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    // iOS drops an utterance queued in the same tick as cancel().
    setTimeout(() => synth.speak(utter), 60);
  } else {
    synth.speak(utter);
  }
  return true;
}

export function stop() {
  if (supported) window.speechSynthesis.cancel();
}

// Call once from the first user tap so later speech is allowed on iOS.
export function unlock() {
  if (!supported) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
  loadVoices();
}
