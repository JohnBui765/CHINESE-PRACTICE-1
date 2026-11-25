// Lists tab: every saved list (most recently updated first) with a search field. A search shows
// the matching words first (from every list: by characters, pinyin with or without tones, or
// English; tap one for how to write it), then the lists whose names or words match, then the
// words of the built-in HSK 1-3 dictionary that are not in a list.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screen, section, row, badge, emptyState } from '../ui/components.js';
import { push } from '../ui/router.js';
import { showWord } from '../ui/word.js';
import * as store from '../data/store.js';
import { isDue } from '../core/srs.js';
import { debounce, plural } from '../core/util.js';
import { countLabel, fold, searchWords, pinyinLabel, pinyinLetters } from '../core/lists.js';
import { hskMatches } from '../core/hsk.js';
import { hskDictionary } from '../data/hsk.js';

const SEARCH_DELAY = 200;
const HINT_MAX = 28;
const WORDS_MAX = 30;

const openImport = () => push('import', {}, { modal: true });

function searchable(list) {
  return (list.entries || []).map((e) => [e.word, e.pinyin, e.said, e.meaning].filter(Boolean).join(' '));
}

// Orange "4 due" when practised entries are due, "New" when never practised.
function statusOf(list, progress, now) {
  let due = 0;
  let seen = 0;
  for (const entry of list.entries || []) {
    const p = progress.get(entry.id);
    if (!p) continue;
    seen++;
    if (isDue(p, now)) due++;
  }
  if (due) return { text: `${due} due`, tone: 'orange' };
  if (!list.lastPracticedAt && !seen) return { text: 'New', tone: 'accent' };
  return null;
}

function makeEntry(list, progress, now) {
  const texts = searchable(list);
  return {
    list,
    head: fold(list.name || ''),
    texts,
    folded: texts.map(fold),
    words: (list.entries || []).map((e) => e.word),
    status: statusOf(list, progress, now),
  };
}

// Returns null when the entry does not match, else { hint }: the word that matched when the
// list name did not.
function match(entry, tokens) {
  if (!tokens.length) return { hint: null };
  if (tokens.every((t) => entry.head.includes(t))) return { hint: null };
  const all = `${entry.head}\n${entry.folded.join('\n')}`;
  if (!tokens.every((t) => all.includes(t))) return null;
  const i = entry.folded.findIndex((w) => tokens.every((t) => w.includes(t)));
  const word = i >= 0 ? entry.words[i] : null;
  return { hint: word && word.length > HINT_MAX ? `${word.slice(0, HINT_MAX - 1)}…` : word };
}

export default async function create() {
  let entries = [];
  let hsk = { lists: [], byWord: new Map() }; // the HSK 1-3 dictionary (data/hsk.js)
  let query = '';
  let visible = true;
  let dirty = false;
  let destroyed = false;
  const rowCache = new Map(); // list id -> { sig, el }

  /* ---------- search field ---------- */

  const input = h('input', {
    type: 'search',
    class: 'lists-search-input',
    placeholder: 'Search',
    'aria-label': 'Search lists and words',
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
  const searchEl = h('div', { class: 'lists-search', role: 'search' }, h('label', { class: 'lists-search-field' }, icon('search'), input), clearBtn);

  /* ---------- list ---------- */

  const wordsSection = section({ header: 'Words', className: 'lists-words', children: [] });
  const wordsGroup = wordsSection.querySelector('.group');
  const wordsFooter = h('div', { class: 'section-footer' }, `The first ${WORDS_MAX} words. Type more to narrow them down.`);
  wordsSection.appendChild(wordsFooter);
  wordsSection.hidden = true;

  const hskSection = section({ header: 'HSK 1–3', className: 'lists-hsk', children: [] });
  const hskGroup = hskSection.querySelector('.group');
  const hskFooter = h('div', { class: 'section-footer' }, `The first ${WORDS_MAX} words. Type more to narrow them down.`);
  hskSection.appendChild(hskFooter);
  hskSection.hidden = true;

  const listSection = section({ className: 'lists-section', children: [] });
  const group = listSection.querySelector('.group');
  const listsHeader = h('div', { class: 'section-header' }, 'Lists');
  const countEl = h('div', { class: 'section-footer lists-count' });
  listSection.appendChild(countEl);
  const noResultsText = h('div', { class: 'lists-noresults-text' });
  const noResults = h('div', { class: 'lists-noresults', hidden: true }, h('div', { class: 'lists-noresults-title' }, 'No Results'), noResultsText);
  const empty = emptyState({
    icon: 'books',
    title: 'No lists yet',
    message: 'Paste a lesson list, or open a .txt list saved from Hanzi Grid.',
    action: { label: 'Add a list', icon: 'plus', onTap: openImport },
  });
  empty.classList.add('lists-empty');

  const s = screen({
    title: 'Lists',
    tab: 'lists',
    className: 'lists-screen',
    actions: [{ icon: 'plus', ariaLabel: 'New list', onTap: openImport }],
    body: [searchEl, wordsSection, listSection, hskSection, noResults, empty],
  });

  function rowFor(entry, hint) {
    const { list, status } = entry;
    const title = list.name || 'Untitled list';
    const subtitle = countLabel(list);
    const sig = `${title}|${subtitle}|${hint || ''}|${status ? status.text : ''}`;
    const cached = rowCache.get(list.id);
    if (cached && cached.sig === sig) return cached.el;
    const trail = h('span', { class: 'lists-trail' }, status ? badge(status.text, status.tone) : null, h('span', { class: 'row-chevron' }, icon('chevronRight')));
    const el = row({
      icon: 'book',
      iconBg: 'var(--accent)',
      title,
      subtitle: hint ? h('span', null, h('span', { class: 'lists-hit' }, `“${hint}”`), ` · ${subtitle}`) : subtitle,
      accessory: trail,
      className: 'lists-row',
      onTap: () => push('list', { listId: list.id }),
    });
    rowCache.set(list.id, { sig, el });
    return el;
  }

  // "HSK 1" after the lists of one of the owner's words that is also in the dictionary.
  const hskLevels = (found) => (found.entry.hsk ? [] : [...new Set(hskMatches(found.entry, hsk.byWord).map((e) => `HSK ${e.hsk}`))]);

  // A word found by the search: its characters, pinyin and meaning, and the lists it is in.
  function wordRow(found) {
    const py = pinyinLabel(found.entry);
    return row({
      title: h('span', { class: 'ent-head' }, h('span', { class: 'ent-zh kai', lang: 'zh' }, found.word), py ? h('span', { class: 'ent-py', lang: 'zh-Latn' }, py) : null),
      subtitle: h(
        'span',
        null,
        found.entry.meaning ? h('span', { class: 'ent-mean' }, found.entry.meaning) : null,
        h('span', { class: 'lists-word-in' }, [...found.lists.map((l) => l.name || 'Untitled list'), ...hskLevels(found)].join(' · ')),
      ),
      className: 'ent lists-word',
      onTap: () => showWord(found.entry, { entries: found.list.entries }),
    });
  }

  // The key under which searchWords() makes one result of a word and its reading.
  const keyOf = (found) => `${found.word}|${pinyinLetters(found.entry.pinyin)}`;

  function render() {
    const hasLists = entries.length > 0;
    const tokens = fold(query).split(' ').filter(Boolean);
    empty.hidden = hasLists || tokens.length > 0;
    searchEl.hidden = !hasLists && !hsk.lists.length;
    // One more than shown, to know whether there are more.
    const found = tokens.length ? searchWords(entries.map((e) => e.list), query, { limit: WORDS_MAX + 1 }) : [];
    const words = found.slice(0, WORDS_MAX);
    wordsGroup.replaceChildren(...words.map(wordRow));
    wordsSection.hidden = words.length === 0;
    wordsFooter.hidden = found.length <= WORDS_MAX;
    // The dictionary's words, without the ones already found in the lists.
    const mine = new Set(found.map(keyOf));
    const hskFound = tokens.length ? searchWords(hsk.lists, query, { limit: WORDS_MAX + 1 + mine.size }).filter((f) => !mine.has(keyOf(f))) : [];
    const hskWords = hskFound.slice(0, WORDS_MAX);
    hskGroup.replaceChildren(...hskWords.map(wordRow));
    hskSection.hidden = hskWords.length === 0;
    hskFooter.hidden = hskFound.length <= WORDS_MAX;
    const rows = [];
    for (const entry of entries) {
      const m = match(entry, tokens);
      if (m) rows.push(rowFor(entry, m.hint));
    }
    group.replaceChildren(...rows);
    if (tokens.length && (words.length || hskWords.length)) listSection.prepend(listsHeader);
    else listsHeader.remove();
    listSection.hidden = rows.length === 0;
    noResults.hidden = !tokens.length || rows.length > 0 || words.length > 0 || hskWords.length > 0;
    if (!rows.length) noResultsText.textContent = `Nothing matches “${query.trim()}”.`;
    countEl.textContent = tokens.length ? `${rows.length} of ${plural(entries.length, 'list')}` : plural(entries.length, 'list');
  }

  async function load() {
    const [lists, progress, dict] = await Promise.all([store.getLists(), store.getProgress(), hskDictionary()]);
    if (destroyed) return;
    hsk = dict;
    const now = Date.now();
    entries = lists.map((l) => makeEntry(l, progress, now));
    const ids = new Set(lists.map((l) => l.id));
    for (const id of rowCache.keys()) if (!ids.has(id)) rowCache.delete(id);
    dirty = false;
    render();
  }

  const runSearch = debounce(() => {
    query = input.value;
    render();
  }, SEARCH_DELAY);

  function clearSearch() {
    input.value = '';
    query = '';
    searchEl.classList.remove('has-text');
    render();
  }

  // Dismiss the keyboard when the user starts scrolling the results (iOS).
  let touchY = null;
  s.scroll.addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
  s.scroll.addEventListener(
    'touchmove',
    (e) => {
      if (touchY !== null && document.activeElement === input && Math.abs(e.touches[0].clientY - touchY) > 12) input.blur();
    },
    { passive: true },
  );

  const scheduleLoad = debounce(() => {
    if (destroyed) return;
    if (visible) load();
    else dirty = true;
  }, 120);
  const unsubscribe = store.onChange(({ store: name }) => {
    if (name === 'lists' || name === 'progress' || name === 'all') scheduleLoad();
  });
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && visible) load();
  };
  document.addEventListener('visibilitychange', onVisibility);

  try {
    await load();
  } catch (err) {
    console.error(err);
    render();
  }

  return {
    el: s.el,
    title: 'Lists',
    onShow(opts = {}) {
      visible = true;
      if (!opts.first || dirty) load();
    },
    onHide() {
      visible = false;
    },
    onDestroy() {
      destroyed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
