// "New list" / "Edit list" full-screen modal: paste a lesson list (or an AI reply), or open a
// .txt file saved from Hanzi Grid, check the preview, save.
// params: {} for a new list, { listId } to edit an existing list's text.
import { h } from '../ui/dom.js';
import { screen, section, row, button, textArea, textField, emptyState, toast } from '../ui/components.js';
import { pop, push } from '../ui/router.js';
import { readText as readClipboard } from '../ui/clipboard.js';
import { pickFile, readTextFile } from '../ui/files.js';
import { keepVisible } from '../ui/viewport.js';
import * as store from '../data/store.js';
import { readText } from '../core/extract.js';
import { withIds, countLabel, pinyinLabel } from '../core/lists.js';
import { isSentence } from '../core/extract.js';
import { uid, debounce } from '../core/util.js';

const PREVIEW_DELAY = 200;
const PREVIEW_MAX = 40;
const DRAFT_DELAY = 250;
const DRAFT_TTL = 24 * 60 * 60 * 1000;
const draftKey = (listId) => `chinese-practice-1.import.draft.${listId || 'new'}`;

const PLACEHOLDER = '# Bài 5\n女朋友 | nǚ péngyou | girlfriend\n= 我有一个女朋友。 | Wó yǒu yí ge nǚ péngyou. | I have a girlfriend.\n> 女 | nǚ | woman\n> 朋 | péng | friend\n> 友 | yǒu → you | friend\n哪 | nǎ | which';

// The text is kept as a draft while typing, so it survives iOS closing the app.
function readDraft(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    if (!draft || typeof draft.text !== 'string' || !(Date.now() - draft.at < DRAFT_TTL)) return null;
    return draft;
  } catch {
    return null;
  }
}

function writeDraft(key, draft) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    /* storage blocked: the screen still works, the draft just is not kept */
  }
}

// One preview row per entry (the characters indented under their word).
export function entryRow(entry, { onTap, status, warning } = {}) {
  const depth = Number(entry.depth) || 0;
  const py = pinyinLabel(entry);
  const title = h(
    'span',
    { class: 'ent-head' },
    h('span', { class: 'ent-zh kai', lang: 'zh' }, entry.word),
    depth === 0 && !isSentence(entry.word) ? h('span', { class: 'ent-print print', lang: 'zh' }, entry.word) : null,
    py ? h('span', { class: 'ent-py', lang: 'zh-Latn' }, py) : null,
  );
  const subtitle = h(
    'span',
    null,
    entry.meaning ? h('span', { class: 'ent-mean' }, entry.meaning) : null,
    entry.example ? h('span', { class: 'ent-ex' }, h('span', { class: 'kai', lang: 'zh' }, entry.example), entry.examplePinyin ? ` ${entry.examplePinyin}` : '', entry.exampleMeaning ? ` · ${entry.exampleMeaning}` : '') : null,
    warning ? h('span', { class: ['ent-warn', warning.red && 'red'] }, warning.text) : null,
    status ? h('span', { class: ['ent-status', status.due && 'due'] }, status.text) : null,
  );
  return row({
    title,
    subtitle,
    accessory: onTap ? 'chevron' : 'none',
    onTap,
    className: ['ent', depth > 0 && 'ent-part', depth > 1 && 'ent-part2', isSentence(entry.word) && 'ent-sentence'].filter(Boolean).join(' '),
  });
}

export default async function create(params) {
  const editing = params.listId ? await store.getList(params.listId) : null;
  if (params.listId && !editing) {
    const s = screen({
      title: 'Edit list',
      largeTitle: false,
      left: [{ label: 'Cancel', onTap: () => pop() }],
      body: [emptyState({ icon: 'books', title: 'List not found', message: 'It may have been deleted.', action: { label: 'Close', onTap: () => pop() } })],
    });
    return { el: s.el, title: 'Edit list', swipeBack: false, missing: true };
  }

  const draftId = draftKey(editing?.id);
  const draft = readDraft(draftId);
  let nameTouched = !!editing || !!draft?.nameTouched;
  let fallbackName = 'Untitled';
  let result = null; // the last readText() result

  const ta = textArea({
    value: draft?.text ?? editing?.rawText ?? '',
    placeholder: PLACEHOLDER,
    rows: 9,
    className: 'imp-text',
    ariaLabel: 'List text',
    onInput: () => {
      schedulePreview();
      scheduleDraft();
    },
  });
  ta.addEventListener('focus', () => keepVisible(ta));
  const nameField = textField({
    value: draft?.name ?? editing?.name ?? '',
    placeholder: 'List name',
    ariaLabel: 'List name',
    onInput: () => {
      nameTouched = true;
      scheduleDraft();
    },
  });

  const pasteBtn = button({ label: 'Paste', icon: 'clipboard', variant: 'tinted', onTap: () => paste() });
  const fileBtn = button({ label: 'Open file…', icon: 'upload', variant: 'tinted', onTap: () => openFile() });
  const notices = h('div', { class: 'imp-notices' });
  const previewHost = h('div', { class: 'imp-preview' });
  const saveBtn = button({ label: 'Save', size: 'large', block: true, disabled: true, onTap: () => save() });
  const saveLabel = saveBtn.querySelector('span');

  const s = screen({
    title: editing ? 'Edit list' : 'New list',
    largeTitle: false,
    solidNav: true,
    left: [{ label: 'Cancel', onTap: () => cancel() }],
    body: [h('div', { class: 'imp-actions' }, pasteBtn, fileBtn), ta, notices, h('label', { class: 'imp-label' }, 'List name'), nameField, previewHost],
    footer: [saveBtn],
  });

  /* ---------- preview ---------- */

  const notice = (text, warn = false) => h('p', { class: ['imp-notice', warn && 'warn'] }, text);

  function preview() {
    const text = ta.value;
    result = text.trim() ? readText(text, fallbackName) : null;
    const items = [];
    const rows = [];
    if (result) {
      if (!nameTouched) nameField.value = result.name;
      if (result.continueFrom) items.push(notice(`The AI's answer is not finished (continue from page ${result.continueFrom}). Type "continue" in the AI chat and paste the next part under this one.`, true));
      if (result.nothing) items.push(notice(`The AI found nothing to copy: ${result.nothing}`, true));
      if (result.echoedExample) items.push(notice("This is the prompt's own format example, not a reply.", true));
      if (result.removed) items.push(notice(`${result.removed} repeated ${result.removed === 1 ? 'line was' : 'lines were'} removed.`));
      if (result.isReply && result.total !== null && result.total !== result.lines) items.push(notice(`The reply says "total: ${result.total}" but has ${result.lines} word lines: check that nothing is missing.`, true));
      if (!result.entries.length && !result.nothing && !result.continueFrom) items.push(notice('No Chinese words found yet.', true));
      for (const entry of result.entries.slice(0, PREVIEW_MAX)) rows.push(entryRow(entry));
    }
    notices.replaceChildren(...items);
    const more = result ? result.entries.length - PREVIEW_MAX : 0;
    previewHost.replaceChildren(rows.length ? section({ header: 'Preview', footer: more > 0 ? `And ${more} more.` : null, children: rows }) : null);
    const ok = !!result && result.entries.length > 0 && !result.continueFrom && !result.echoedExample;
    saveBtn.disabled = !ok;
    saveLabel.textContent = ok ? `Save ${countLabel({ entries: result.entries })}` : 'Save';
  }
  const schedulePreview = debounce(preview, PREVIEW_DELAY);

  /* ---------- paste, open file ---------- */

  async function paste() {
    const text = await readClipboard();
    if (text === null) {
      toast('Could not read the clipboard: tap the text box and paste there.', { icon: 'info', tone: 'accent', duration: 3500 });
      ta.focus();
      return;
    }
    if (!text.trim()) {
      toast('The clipboard is empty', { icon: 'info', tone: 'accent' });
      return;
    }
    ta.value = text;
    fallbackName = 'Untitled';
    preview();
    scheduleDraft();
  }

  async function openFile() {
    const file = await pickFile('.txt,text/plain');
    if (!file) return;
    try {
      ta.value = await readTextFile(file);
    } catch (err) {
      console.error(err);
      toast('Could not read that file.', { icon: 'xCircle', tone: 'red' });
      return;
    }
    fallbackName = file.name.replace(/\.[^.]+$/, '') || 'Untitled';
    preview();
    scheduleDraft();
  }

  /* ---------- save, cancel ---------- */

  let left = false;

  async function save() {
    if (saveBtn.disabled) return;
    preview();
    if (saveBtn.disabled || !result) return;
    saveBtn.disabled = true;
    const name = nameField.value.trim() || result.name || 'Untitled';
    const rawText = ta.value;
    try {
      if (editing) {
        const latest = (await store.getList(editing.id)) || editing;
        await store.saveList({ ...latest, name, rawText, entries: withIds(result.entries, latest.entries || []) });
        discardDraft();
        toast('List updated');
        await pop();
      } else {
        const list = await store.saveList({ id: uid(), name, rawText, entries: withIds(result.entries) });
        discardDraft();
        toast('List saved');
        await pop();
        push('list', { listId: list.id });
      }
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      toast('Could not save the list.', { icon: 'xCircle', tone: 'red' });
    }
  }

  function cancel() {
    discardDraft();
    pop();
  }

  /* ---------- draft ---------- */

  let draftTimer = 0;

  function flushDraft() {
    clearTimeout(draftTimer);
    draftTimer = 0;
    if (left) return;
    const dirty = ta.value !== (editing?.rawText ?? '') || nameField.value !== (editing?.name ?? '');
    writeDraft(draftId, dirty ? { text: ta.value, name: nameField.value, nameTouched, at: Date.now() } : null);
  }

  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, DRAFT_DELAY);
  }

  function discardDraft() {
    left = true;
    clearTimeout(draftTimer);
    writeDraft(draftId, null);
  }

  preview();

  return {
    el: s.el,
    title: editing ? 'Edit list' : 'New list',
    swipeBack: false,
    onHide: () => flushDraft(),
    onDestroy: () => flushDraft(),
  };
}
