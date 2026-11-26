// One list: progress, the practice modes, and every entry (the characters of a word indented
// under it), with a search box that filters the entries. Tapping an entry opens its word page
// (ui/word.js): how to write it, then everything else. params: { listId }
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screen, section, row, segmented, emptyState, actionSheet, confirm, toast } from '../ui/components.js';
import { push, pop } from '../ui/router.js';
import { saveFile } from '../ui/files.js';
import { showWord, statusOf, warningOf } from '../ui/word.js';
import * as store from '../data/store.js';
import { charSets } from '../data/chars.js';
import { strokeChars } from '../data/strokes.js';
import { summary, newProgress } from '../core/srs.js';
import { toLessonText, safeFileName } from '../core/extract.js';
import { countLabel, matchEntry } from '../core/lists.js';
import { writableChars } from '../core/strokes.js';
import { debounce, plural } from '../core/util.js';
import { MODES, SCOPES, practiceEntries, hasSideB, canTypePinyin, buildCards } from './practice/session.js';
import { entryRow } from './import.js';

const STAGES = [
  { key: 'new', label: 'New', color: 'var(--label-3)' },
  { key: 'learning', label: 'Learning', color: 'var(--orange)' },
  { key: 'review', label: 'Reviewing', color: 'var(--blue)' },
  { key: 'mastered', label: 'Mastered', color: 'var(--green)' },
];

const SEARCH_DELAY = 150;

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
  const [sets, strokeSet] = await Promise.all([charSets(), strokeChars()]);

  const s = screen({
    title: list.name,
    back: { label: ctx.backLabel || 'Back' },
    actions: [{ icon: 'ellipsis', ariaLabel: 'More', onTap: () => more() }],
    body: [],
  });

  /* ---------- the search box above the entries ---------- */
  // Made once and never moved, so typing keeps the keyboard up while the page refreshes.
  let query = '';
  const input = h('input', {
    type: 'search',
    class: 'lists-search-input',
    placeholder: 'Find a word',
    'aria-label': 'Find a word in this list',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    onInput: () => {
      searchEl.classList.toggle('has-text', input.value !== '');
      runSearch();
    },
    onKeydown: (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape' && input.value) {
        e.stopPropagation();
        clearSearch();
      }
    },
  });
  const clearBtn = h(
    'button',
    {
      type: 'button',
      class: 'lists-clear',
      'aria-label': 'Clear search',
      tabindex: '-1',
      onPointerdown: (e) => e.preventDefault(),
      onMousedown: (e) => e.preventDefault(),
      onClick: () => {
        clearSearch();
        input.focus();
      },
    },
    h('span', { class: 'lists-clear-dot' }, icon('close')),
  );
  const searchEl = h('div', { class: 'lists-search ld-search', role: 'search' }, h('label', { class: 'lists-search-field' }, icon('search'), input), clearBtn);
  const runSearch = debounce(() => {
    query = input.value.trim();
    showRows();
  }, SEARCH_DELAY);
  function clearSearch() {
    input.value = '';
    query = '';
    searchEl.classList.remove('has-text');
    showRows();
  }

  const top = h('div');
  const wordsHost = h('div');
  const body = h('div', { class: 'ld' }, top, searchEl, wordsHost);
  s.content.appendChild(body);

  let alive = true;
  let rendering = null;
  let rows = []; // [{ entry, el }] in lesson order

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
    const writable = pool.filter((e) => writableChars(e.word, strokeSet)).length;
    const typable = pool.filter(canTypePinyin).length;
    const gapCards = buildCards(list, 'cloze', { scope }).length;
    const boards = buildCards(list, 'match', { scope });
    const pairs = boards.reduce((n, b) => n + b.itemIds.length, 0);
    const modeRow = (mode, count) =>
      row({ icon: MODES[mode].icon, iconBg: MODES[mode].color, title: MODES[mode].label, subtitle: `${MODES[mode].short} · ${count}`, onTap: () => push('practice', { listId: list.id, mode }, { modal: true }) });
    // Easiest first.
    const modeRows = [
      scopeRow,
      modeRow('recall', `${pool.length} cards`),
      modeRow('recallReverse', `${sideB} cards`),
      modeRow('match', boards.length ? `${plural(pairs, 'pair')} on ${plural(boards.length, 'board')}` : '0 pairs'),
      modeRow('choose', `${sideB} cards`),
      modeRow('cloze', `${gapCards} cards`),
      modeRow('pinyin', `${typable} cards`),
      modeRow('write', `${writable} cards`),
    ];
    if (sum.due && sum.due < sum.total) modeRows.push(row({ icon: 'flame', iconBg: 'var(--orange)', title: 'Review what is due', subtitle: `${sum.due} of these cards are due now`, onTap: () => push('practice', { mode: 'review' }, { modal: true }) }));

    rows = (list.entries || []).map((entry) => ({
      entry,
      el: entryRow(entry, {
        status: statusOf(progress.get(entry.id), now),
        warning: warningOf(entry, sets),
        onTap: () => showWord(entry, { entries: list.entries, progress: progress.get(entry.id) || null }),
      }),
    }));

    top.replaceChildren(stages, section({ header: 'Practise', footer: `Words: the words and sentences. Characters: the characters listed under them. All: both. ${pool.length} cards now.`, children: modeRows }));
    searchEl.hidden = rows.length === 0;
    showRows();
  }

  // The entries, or the ones that match the search (in lesson order).
  function showRows() {
    if (!rows.length) {
      wordsHost.replaceChildren(section({ header: countLabel(list), children: [row({ title: 'This list is empty', subtitle: 'Use Edit list to add words.' })] }));
      return;
    }
    const shown = query ? rows.filter((r) => matchEntry(r.entry, query) >= 0) : rows;
    const header = query ? `${plural(shown.length, 'match', 'matches')} · ${countLabel(list)}` : countLabel(list);
    wordsHost.replaceChildren(
      shown.length
        ? section({ header, children: shown.map((r) => r.el) })
        : h('div', { class: 'lists-noresults ld-noresults' }, h('div', { class: 'lists-noresults-title' }, 'No Results'), h('div', { class: 'lists-noresults-text' }, `No word here matches “${query}”. Search all your lists on the Lists tab.`)),
    );
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
