// Settings tab: practice options, appearance, backup, help.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screen, section, row, segmented, toggle, slider, sheet, actionSheet, confirm, toast } from '../ui/components.js';
import { saveFile, pickFile } from '../ui/files.js';
import { resetTo } from '../ui/router.js';
import { chineseVoices, allVoicesRaw, speak, supported as speechSupported, voiceQuality, voiceName, voiceRegion, currentVoice, QUALITY_LABEL, isChinese } from '../ui/speech.js';
import { copyText } from '../ui/clipboard.js';
import * as store from '../data/store.js';
import { SCOPES } from './practice/session.js';

export const VERSION = '0.3';

const TEST_SENTENCE = '你好！我想喝水。';

const AUTO_ADVANCE = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 second' },
  { value: 2, label: '2 seconds' },
  { value: 3, label: '3 seconds' },
  { value: 5, label: '5 seconds' },
];
const REVIEW_LIMIT = [10, 20, 30, 50].map((n) => ({ value: n, label: `${n} cards` }));
const HINT_AFTER = [
  { value: 2, label: 'After 2 misses' },
  { value: 3, label: 'After 3 misses' },
  { value: 5, label: 'After 5 misses' },
  { value: 0, label: 'Never' },
];
const LENIENCY = [
  { value: 1.5, label: 'Lenient' },
  { value: 1, label: 'Normal' },
  { value: 0.7, label: 'Strict' },
];

const labelOf = (options, value) => options.find((o) => o.value === value)?.label ?? String(value);

function controlRow(title, control, subtitle) {
  return h(
    'div',
    { class: 'row settings-control' },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title', style: { display: 'block' } }, title), subtitle ? h('span', { class: 'row-subtitle', style: { display: 'block' } }, subtitle) : null),
    control,
  );
}

function stackedRow(title, control) {
  return h('div', { class: 'row settings-stacked' }, h('div', { class: 'row-title' }, title), control);
}

function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function exportBackup() {
  const data = await store.exportAll();
  const json = JSON.stringify(data, null, 1);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await saveFile(new Blob([json], { type: 'application/json' }), `hanzi-drill-backup-${date}.json`);
}

async function importBackup() {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    store.validateBackup(data);
  } catch (err) {
    toast(err.message && !/JSON/.test(err.message) ? err.message : 'That file is not a valid backup.', { icon: 'xCircle', tone: 'red', duration: 3500 });
    return;
  }
  const count = data.lists.filter(store.isListRecord).length;
  const mode = await actionSheet({
    title: `Restore ${count} ${count === 1 ? 'list' : 'lists'}?`,
    message: 'Merge keeps your current lists and adds anything newer from the backup. Replace deletes what is on this phone first.',
    actions: [
      { label: 'Merge with my lists', value: 'merge' },
      { label: 'Replace everything', value: 'replace', style: 'destructive' },
    ],
  });
  if (!mode) return;
  if (mode === 'replace' && !(await confirm({ title: 'Replace all data?', message: 'Lists and progress on this phone will be deleted.', confirmLabel: 'Replace', destructive: true }))) return;
  try {
    const res = await store.importAll(data, { mode });
    await resetTo('settings');
    toast(`Restored ${res.lists} ${res.lists === 1 ? 'list' : 'lists'}`);
  } catch (err) {
    toast(err.message || 'Could not restore the backup.', { icon: 'xCircle', tone: 'red', duration: 3500 });
  }
}

function infoSheet(title, paragraphs) {
  sheet({
    title,
    content: h(
      'div',
      { class: 'settings-help' },
      paragraphs.map((p) => (Array.isArray(p) ? h('ol', null, p.map((li) => h('li', null, li))) : typeof p === 'string' ? h('p', null, p) : p)),
    ),
  });
}

function installHelp() {
  infoSheet('Install on iPhone', [
    'Hanzi Drill works like a normal app once it is on your Home Screen: full screen, offline, and it keeps your lists.',
    [
      h('span', null, 'Open this page in ', h('strong', null, 'Safari'), '.'),
      h('span', null, 'Tap the ', h('strong', null, 'Share'), ' button ', icon('share', { size: 16, className: 'inline-icon' }), ' in the toolbar.'),
      h('span', null, 'Scroll down and tap ', h('strong', null, 'Add to Home Screen'), '.'),
      h('span', null, 'Tap ', h('strong', null, 'Add'), '. Open it from the new icon.'),
    ],
    'Your lists are stored only on this phone. Use Export backup now and then to keep a copy in Files or iCloud Drive.',
  ]);
}

// Voices can take up to 1.5 s to load on a cold start: ignore taps meanwhile.
let voiceSheetOpening = false;
async function voiceSheet(onPicked) {
  if (voiceSheetOpening) return;
  voiceSheetOpening = true;
  let voices;
  try {
    voices = await chineseVoices();
  } finally {
    voiceSheetOpening = false;
  }
  const current = store.settings().voiceURI;
  let s;
  const pick = async (uri) => {
    await store.setSetting('voiceURI', uri);
    onPicked();
    s.close();
  };
  const preview = (v) => speak(TEST_SENTENCE, { voiceURI: v ? v.voiceURI : '', rate: store.settings().speechRate });
  const describe = (v) => `${QUALITY_LABEL[voiceQuality(v)]} · ${voiceRegion(v)}`;
  const auto = currentVoice('');
  const voiceRow = (v) =>
    row({
      title: v ? voiceName(v) : 'Automatic',
      subtitle: v ? describe(v) : auto ? `Best on this device: ${voiceName(auto)} · ${QUALITY_LABEL[voiceQuality(auto)]}` : 'Picks the clearest Mandarin voice',
      accessory: (v ? v.voiceURI : '') === current ? h('span', { class: 'check-mark' }, icon('check')) : h('span', { class: 'check-mark' }),
      onTap: () => {
        preview(v);
        pick(v ? v.voiceURI : '');
      },
    });
  const best = voices.filter((v) => voiceQuality(v) === 'premium' || voiceQuality(v) === 'enhanced');
  const standard = voices.filter((v) => voiceQuality(v) === 'default');
  const howTo = 'Download one in iPhone Settings › Accessibility › Spoken Content › Voices › Chinese (a voice marked Enhanced or Premium, e.g. Li-mu or Yu-shu). Then close Hanzi Drill completely (swipe it away in the app switcher) and open it again so it can see the new voice.';
  s = sheet({
    title: 'Voice',
    content: [
      section({ children: [voiceRow(null)] }),
      best.length
        ? section({ header: 'Best quality', footer: 'Enhanced and Premium voices sound much more natural and work offline.', children: best.map(voiceRow) })
        : section({ header: 'Best quality', children: [h('div', { class: 'row voice-empty' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', style: { display: 'block' } }, 'No Enhanced or Premium Chinese voice found'), h('span', { class: 'row-subtitle', style: { display: 'block' } }, howTo)))] }),
      standard.length ? section({ header: 'Standard', footer: best.length ? 'Standard voices are the small built-in ones and sound flat.' : null, children: standard.map(voiceRow) }) : null,
      section({ children: [row({ title: 'Every voice this device shares', subtitle: 'The raw list, all languages, for troubleshooting', onTap: () => voiceDiagnostics() })] }),
      !voices.length ? h('p', { class: 'muted small', style: { padding: '0 16px' } }, 'No Chinese voice was found on this device.') : null,
    ],
  });
}

// Shows exactly what speechSynthesis.getVoices() returns, unfiltered, with a Copy button.
async function voiceDiagnostics() {
  const raw = await allVoicesRaw();
  const chinese = raw.filter((v) => isChinese(v.lang));
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const report = [
    'Hanzi Drill voice report',
    `Voices reported: ${raw.length} (Chinese: ${chinese.length})`,
    `Home Screen app: ${standalone ? 'yes' : 'no'}`,
    `Browser: ${navigator.userAgent}`,
    '',
    ...raw.map((v) => `${v.name} | ${v.lang} | ${v.voiceURI}${v.localService ? '' : ' | online'}${v.default ? ' | default' : ''}`),
  ].join('\n');
  const voiceLine = (v) => row({ title: v.name, subtitle: `${v.lang} · ${v.voiceURI}`, detail: QUALITY_LABEL[voiceQuality(v)], accessory: 'none' });
  sheet({
    title: 'Every voice',
    right: { label: 'Copy', strong: true, onTap: async () => toast((await copyText(report)) ? 'Voice list copied' : 'Could not copy', { icon: 'copy', tone: 'accent' }) },
    content: [
      h('p', { class: 'muted small', style: { margin: '0 4px 14px' } }, `The browser gave the app ${raw.length} voices (${chinese.length} Chinese). A voice missing here cannot be reached from a web app.`),
      chinese.length ? section({ header: 'Chinese', children: chinese.map(voiceLine) }) : null,
      raw.length > chinese.length ? section({ header: 'Other languages', children: raw.filter((v) => !chinese.includes(v)).map(voiceLine) }) : null,
    ],
  });
}

function listsHelp() {
  infoSheet('Where lists come from', [
    'A list is a lesson in the format Hanzi Grid saves: one line per word with its pinyin and meaning, the characters of the word on "> " lines under it, and an example sentence on a "= " line.',
    [
      'In Hanzi Grid, check a lesson and tap Save list. The .txt file goes to Files.',
      'Here, tap + on the Lists tab, then Open file… and pick that file. Or paste the text.',
      'Check the preview and tap Save.',
    ],
    'Pasting an AI reply to a Hanzi Grid prompt works too: the same reader is used.',
  ]);
}

export default async function create() {
  const st = store.settings();
  const voiceDetail = h('span', null, 'Automatic');
  const refreshVoiceName = async () => {
    const uri = store.settings().voiceURI;
    await chineseVoices();
    const v = currentVoice(uri);
    voiceDetail.textContent = v ? `${uri ? '' : 'Auto · '}${voiceName(v)}${voiceQuality(v) === 'default' ? '' : ` (${QUALITY_LABEL[voiceQuality(v)]})`}` : 'None found';
  };
  refreshVoiceName();

  // A choice opens a sheet of options with a checkmark on the current one.
  const choiceRow = (title, key, options, { subtitle, sheetTitle = title, sheetFooter } = {}) => {
    const detail = h('span', null, labelOf(options, store.settings()[key]));
    let open = null;
    return row({
      title,
      subtitle,
      detail,
      onTap: () => {
        if (open) return;
        const current = store.settings()[key];
        const optionRow = (o) =>
          row({
            title: o.label,
            accessory: h('span', { class: 'check-mark' }, o.value === current ? icon('check') : null),
            onTap: async () => {
              if (!open) return;
              const sh = open;
              open = null;
              await store.setSetting(key, o.value);
              detail.textContent = labelOf(options, o.value);
              sh.close();
            },
          });
        open = sheet({
          title: sheetTitle,
          content: section({ footer: sheetFooter, children: options.map(optionRow) }),
          onClose: () => {
            open = null;
          },
        });
      },
    });
  };

  const set = (key) => (value) => store.setSetting(key, value);

  const storageRowDetail = h('span', null, '…');
  store.storageStatus().then((x) => {
    storageRowDetail.textContent = x.durable ? `${formatBytes(x.usage)}${x.persistent ? ' · protected' : ''}` : 'Temporary';
    if (!x.durable) storageRowDetail.classList.add('settings-warn');
  });

  const body = [
    section({
      header: 'Practice',
      footer: 'Words: the words and sentences of a list. Characters: the characters listed under them.',
      children: [
        stackedRow('What to practise', segmented({ options: SCOPES, value: st.scope, onChange: set('scope'), ariaLabel: 'What to practise' })),
        choiceRow('Cards per review', 'reviewLimit', REVIEW_LIMIT),
        choiceRow('Continue after grading', 'autoAdvance', AUTO_ADVANCE, { sheetTitle: 'Auto-continue', sheetFooter: 'After you grade a card, go to the next one on its own after this long.' }),
        controlRow('Show the print form', toggle({ checked: st.showPrint, onChange: set('showPrint'), label: 'Show the print form' }), 'The screen shape 黑体 under the handwriting shape 楷体'),
      ],
    }),
    section({
      header: 'Typed pinyin',
      footer: 'With tones off, the letters alone count as right; tones you do type are still checked.',
      children: [controlRow('Tones must be right', toggle({ checked: st.pinyinTones, onChange: set('pinyinTones'), label: 'Tones must be right' }))],
    }),
    section({
      header: 'Pronunciation',
      footer: speechSupported ? 'The voices are the iPhone\'s own, so they work offline.' : 'Speech is not available in this browser.',
      children: [
        row({ title: 'Voice', detail: voiceDetail, onTap: () => voiceSheet(refreshVoiceName) }),
        stackedRow(
          'Speed',
          slider({
            min: 0.5,
            max: 1.2,
            step: 0.05,
            value: st.speechRate,
            format: (v) => `${Math.round(v * 100)}%`,
            onChange: (v) => {
              store.setSetting('speechRate', v);
              speak('明天', { rate: v, voiceURI: store.settings().voiceURI });
            },
            ariaLabel: 'Speech speed',
          }),
        ),
        controlRow('Say the word with the answer', toggle({ checked: st.autoSpeak, onChange: set('autoSpeak'), label: 'Say the word with the answer' })),
        row({
          title: 'Test voice',
          accent: true,
          accessory: h('span', { class: 'row-chevron' }, icon('speaker')),
          onTap: () => speak(TEST_SENTENCE, { rate: store.settings().speechRate, voiceURI: store.settings().voiceURI }),
        }),
      ],
    }),
    section({
      header: 'Writing',
      footer: 'Writing checks every stroke you draw: its place, shape and direction, in order.',
      children: [
        choiceRow('Show the stroke as a hint', 'writeHintAfter', HINT_AFTER, { sheetTitle: 'Hint', sheetFooter: 'After this many wrong tries on one stroke, the right stroke lights up. A card that needed hints keeps its review date instead of moving up.' }),
        choiceRow('Strictness', 'writeLeniency', LENIENCY, { sheetFooter: 'How close a drawn stroke must be to count. Lenient suits a finger on a small screen.' }),
        controlRow('Trace the outline', toggle({ checked: st.writeOutline, onChange: set('writeOutline'), label: 'Trace the outline' }), 'Start every character with a faint outline to trace over'),
      ],
    }),
    section({
      header: 'Appearance',
      children: [stackedRow('Theme', segmented({ options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], value: st.theme, onChange: set('theme') }))],
    }),
    section({
      header: 'Backup',
      footer: 'Your lists live only on this phone. Export a backup to Files or iCloud Drive now and then.',
      children: [
        row({ icon: 'upload', iconBg: 'var(--blue)', title: 'Export backup', onTap: () => exportBackup().catch((err) => { console.error(err); toast('Could not save the backup.', { icon: 'xCircle', tone: 'red' }); }) }),
        row({ icon: 'download', iconBg: 'var(--green)', title: 'Restore from backup', onTap: () => importBackup() }),
        row({
          icon: 'info',
          iconBg: store.isPersistentStorage() ? 'var(--gray)' : 'var(--red)',
          title: 'Storage',
          subtitle: store.isPersistentStorage() ? null : 'Unavailable: lists are lost when the app closes',
          detail: storageRowDetail,
        }),
      ],
    }),
    section({
      header: 'Help',
      children: [
        row({ icon: 'phone', iconBg: 'var(--accent)', title: 'Install on iPhone', onTap: installHelp }),
        row({ icon: 'book', iconBg: 'var(--orange)', title: 'Where lists come from', onTap: listsHelp }),
      ],
    }),
    h('p', { class: 'settings-version' }, `Hanzi Drill ${VERSION}`),
  ];

  const s = screen({ title: 'Settings', tab: 'settings', body });
  return { el: s.el, title: 'Settings' };
}
