// Results after a practice session: accuracy ring, stats, the entries missed, and a one-tap
// "Practise mistakes" round.
import { h } from '../../ui/dom.js';
import { button, ring, section, row } from '../../ui/components.js';
import { pop, replace } from '../../ui/router.js';
import * as store from '../../data/store.js';
import { pinyinLabel } from '../../core/lists.js';
import { MODES } from './session.js';

function formatDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function headline(acc) {
  if (acc === 100) return { title: 'Perfect!', tone: 'var(--green)' };
  if (acc >= 80) return { title: 'Great work!', tone: 'var(--green)' };
  if (acc >= 50) return { title: 'Good effort', tone: 'var(--orange)' };
  return { title: 'Keep going', tone: 'var(--red)' };
}

export default async function create(params) {
  const summary = params.summary || { total: 0, right: 0, hinted: 0, wrong: 0, accuracy: 0, missed: [], mode: 'review', durationMs: 0 };
  const mode = MODES[summary.mode] || MODES.review;
  const pct = summary.accuracy;
  const head = headline(pct);

  const r = ring({ fraction: 0, size: 148, stroke: 12, label: `${pct}%`, color: head.tone, labelSize: 36 });
  requestAnimationFrame(() => r.set(pct / 100));

  const stat = (value, label, color) =>
    h('div', { class: 'res-stat' }, h('div', { class: 'res-stat-value tabular', style: { color } }, String(value)), h('div', { class: 'res-stat-label' }, label));

  // The entries missed, with their pinyin and meaning.
  const missedRows = [];
  const listCache = new Map();
  for (const m of summary.missed || []) {
    if (!listCache.has(m.listId)) listCache.set(m.listId, await store.getList(m.listId));
    const list = listCache.get(m.listId);
    const entry = list?.entries.find((e) => e.id === m.itemId);
    if (!entry) continue;
    missedRows.push(
      row({
        title: h('span', { class: 'ent-head' }, h('span', { class: 'ent-zh kai', lang: 'zh' }, entry.word), pinyinLabel(entry) ? h('span', { class: 'ent-py', lang: 'zh-Latn' }, pinyinLabel(entry)) : null),
        subtitle: entry.meaning || null,
        accessory: 'none',
        className: 'ent',
      }),
    );
  }

  const practiseMistakes = () => {
    if (summary.mode === 'review') return replace('practice', { mode: 'review', missed: summary.missed });
    return replace('practice', { listId: summary.listId, mode: summary.mode, itemIds: summary.missed.map((m) => m.itemId), scope: 'all' });
  };

  const body = h(
    'div',
    { class: 'results' },
    h('div', { class: 'res-hero' }, r.el, h('h1', { class: 'res-title' }, head.title), h('p', { class: 'res-sub' }, [...new Set([summary.title, mode.label].filter(Boolean))].join(' · '))),
    h(
      'div',
      { class: 'res-stats' },
      stat(summary.right + summary.hinted, 'Knew', 'var(--green-text)'),
      stat(summary.wrong, summary.wrong === 1 ? 'Missed' : 'Missed', summary.wrong ? 'var(--red-text)' : 'var(--label-2)'),
      stat(formatDuration(summary.durationMs), 'Time', 'var(--label)'),
    ),
    missedRows.length ? section({ header: 'To review', children: missedRows }) : null,
  );

  const done = button({ label: 'Done', variant: missedRows.length ? 'secondary' : 'primary', size: 'large', block: true, onTap: () => pop() });
  const again = missedRows.length ? button({ label: 'Practise mistakes', icon: 'refresh', size: 'large', block: true, onTap: practiseMistakes }) : null;

  const el = h(
    'section',
    { class: 'screen results-screen' },
    h('div', { class: 'scroll' }, h('div', { class: 'scroll-inner' }, body)),
    h('div', { class: 'footer' }, h('div', { class: 'footer-row stacked' }, again, done)),
  );

  return { el, title: 'Results', swipeBack: false };
}
