// One list: progress, the practice modes, and every entry (the characters of a word indented
// under it). params: { listId }
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screen, section, row, segmented, emptyState, actionSheet, confirm, sheet, toast } from '../ui/components.js';
import { push, pop } from '../ui/router.js';
import { saveFile } from '../ui/files.js';
import * as store from '../data/store.js';
import { charSets } from '../data/chars.js';
import { isDue, boxLabel, summary, newProgress } from '../core/srs.js';
import { toLessonText, safeFileName } from '../core/extract.js';
import { countLabel, charWarnings, pinyinLabel } from '../core/lists.js';
import { debounce, startOfDay, DAY } from '../core/util.js';
import { MODES, SCOPES, practiceEntries, hasSideB } from './practice/session.js';
import { entryRow } from './import.js';
import { exampleNode, partsNode, pinyinNode } from './practice/recall.js';

const STAGES = [
  { key: 'new', label: 'New', color: 'var(--label-3)' },
  { key: 'learning', label: 'Learning', color: 'var(--orange)' },
  { key: 'review', label: 'Reviewing', color: 'var(--blue)' },
  { key: 'mastered', label: 'Mastered', color: 'var(--green)' },
];

// "today" | "tomorrow" | "in 3 days"
function whenText(due, now) {
  if (due <= now) return 'today';
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function statusOf(p, now) {
  if (!p || !p.seen) return null;
  if (isDue(p, now)) return { text: `${boxLabel(p.box)} · due for review`, due: true };
  return { text: `${boxLabel(p.box)} · next review ${whenText(p.due, now)}`, due: false };
}

function warningOf(entry, sets) {
  const w = charWarnings(entry.word, sets);
  if (w.missing.length) return { text: `Not in the app's fonts (a traditional or rare character?): ${w.missing.join(' ')}`, red: true };
  if (w.rare.length) return { text: `Unusual character, check it: ${w.rare.join(' ')}`, red: false };
  return null;
}

// Pop once the router is free (onShow runs while it is still busy).
async function leave(tries = 8) {
  if (await pop()) return;
  if (tries > 0) setTimeout(() => leave(tries - 1), 120);
}

export default async function create(params, ctx = {}) {
  let list = await store.getList(params.listId);
  if (!list) {
    const s = screen({ title: 'List', back: { label: ctx.backLabel || 'Back' }, body: [emptyState({ icon: 'books', title: 'List not found', message: 'It may have been deleted.' })] });
    return { el: s.el, title: 'List', missing: true };
  }
  const sets = await charSets();

  const s = screen({
    title: list.name,
    back: { label: ctx.backLabel || 'Back' },
    actions: [{ icon: 'ellipsis', ariaLabel: 'More', onTap: () => more() }],
    body: [],
  });
  const body = h('div', { class: 'ld' });
  s.content.appendChild(body);

  let alive = true;
  let rendering = null;
  let openSheet = null;

  async function render() {
    const fresh = await store.getList(list.id);
    if (!alive) return;
    if (!fresh) {
      leave();
      return;
    }
    list = fresh;
    s.setTitle(list.name);
    const progress = await store.getProgressForList(list.id);
    if (!alive) return;
    const now = Date.now();
    const scope = store.settings().scope;
    const pool = practiceEntries(list, scope);
    const sum = summary(pool.map((e) => progress.get(e.id) || newProgress(e.id, list.id)), now);

    const stages = h('div', { class: 'ld-stages' }, STAGES.map((st) => h('div', { class: 'ld-stage' }, h('div', { class: 'ld-stage-value tabular', style: { color: st.color } }, String(sum[st.key])), h('div', { class: 'ld-stage-label' }, st.label))));

    const scopeRow = h(
      'div',
      { class: 'row ld-scope' },
      h('div', { class: 'ld-scope-title' }, 'Practise'),
      segmented({
        options: SCOPES,
        value: scope,
        ariaLabel: 'What to practise',
        onChange: (v) => store.setSetting('scope', v),
      }),
    );
    const sideB = pool.filter(hasSideB).length;
    const modeRows = [
      scopeRow,
      row({ icon: MODES.recall.icon, iconBg: MODES.recall.color, title: MODES.recall.label, subtitle: `${MODES.recall.short} · ${pool.length} cards`, onTap: () => push('practice', { listId: list.id, mode: 'recall' }, { modal: true }) }),
      row({ icon: MODES.recallReverse.icon, iconBg: MODES.recallReverse.color, title: MODES.recallReverse.label, subtitle: `${MODES.recallReverse.short} · ${sideB} cards`, onTap: () => push('practice', { listId: list.id, mode: 'recallReverse' }, { modal: true }) }),
    ];
    if (sum.due && sum.due < sum.total) modeRows.push(row({ icon: 'flame', iconBg: 'var(--orange)', title: 'Review what is due', subtitle: `${sum.due} of these cards are due now`, onTap: () => push('practice', { mode: 'review' }, { modal: true }) }));

    const entryRows = (list.entries || []).map((entry) =>
      entryRow(entry, {
        status: statusOf(progress.get(entry.id), now),
        warning: warningOf(entry, sets),
        onTap: () => showEntry(entry, progress.get(entry.id), now),
      }),
    );

    body.replaceChildren(
      stages,
      section({ header: 'Practise', footer: `Words: the words and sentences. Characters: the characters listed under them. All: both. ${pool.length} cards now.`, children: modeRows }),
      section({ header: countLabel(list), children: entryRows.length ? entryRows : [row({ title: 'This list is empty', subtitle: 'Use Edit list to add words.' })] }),
    );
  }

  // The entry in a sheet: large, with everything the cards show.
  function showEntry(entry, p, now) {
    if (openSheet) return;
    const status = statusOf(p, now);
    const warning = warningOf(entry, sets);
    const content = h(
      'div',
      { class: 'es-body' },
      h('div', { class: 'es-word kai', lang: 'zh' }, entry.word),
      h('div', { class: 'es-print print', lang: 'zh' }, entry.word),
      h('div', { class: 'rc-row' }, pinyinNode(entry, 'rc-pinyin'), entry.meaning ? h('div', { class: 'rc-meaning' }, entry.meaning) : null),
      entry.unsure ? h('div', { class: 'rc-unsure' }, 'The AI was not sure about this line: check it.') : null,
      warning ? h('div', { class: ['ent-warn', warning.red && 'red'] }, warning.text) : null,
      exampleNode(entry),
      partsNode(entry, list.entries),
      h('div', { class: 'rc-block' }, h('div', { class: 'rc-block-label' }, 'Progress'), h('div', { class: ['ent-status', status?.due && 'due'] }, status ? status.text : 'New · not practised yet')),
    );
    openSheet = sheet({
      title: pinyinLabel(entry) || entry.word,
      content,
      onClose: () => {
        openSheet = null;
      },
    });
  }

  async function more() {
    const choice = await actionSheet({
      title: list.name,
      actions: [
        { label: 'Edit list', value: 'edit' },
        { label: 'Save as .txt file', value: 'export' },
        { label: 'Delete list', value: 'delete', style: 'destructive' },
      ],
    });
    if (choice === 'edit') push('import', { listId: list.id }, { modal: true });
    else if (choice === 'export') exportList();
    else if (choice === 'delete') {
      const ok = await confirm({ title: `Delete “${list.name}”?`, message: 'The list and its practice progress will be removed from this phone.', confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      await store.deleteList(list.id);
      toast('List deleted', { icon: 'trash', tone: 'red' });
      leave();
    }
  }

  // The list in the lesson format Hanzi Grid reads, so it can be opened there too.
  function exportList() {
    const text = toLessonText(list.name, list.entries || []);
    saveFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFileName(list.name)}.txt`).catch((err) => {
      console.error(err);
      toast('Could not save the file.', { icon: 'xCircle', tone: 'red' });
    });
  }

  const refresh = () => {
    if (!rendering) rendering = render().finally(() => (rendering = null));
    return rendering;
  };
  const refreshSoon = debounce(refresh, 120);
  const unsubscribe = store.onChange(({ store: name }) => {
    if (name === 'lists' || name === 'progress' || name === 'settings' || name === 'all') refreshSoon();
  });
  await refresh();

  return {
    el: s.el,
    title: list.name,
    onShow: ({ returning } = {}) => {
      if (returning) refresh();
    },
    onDestroy: () => {
      alive = false;
      unsubscribe();
    },
  };
}
