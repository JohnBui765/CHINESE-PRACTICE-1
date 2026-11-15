// Practice session engine: builds the card queue for a mode, re-queues wrong answers, records
// first-try outcomes and, when the session ends, updates spaced repetition, history and the
// list's lastPracticedAt. Taken from Vocab Studio and cut down to recall cards.
import { shuffle, uid } from '../../core/util.js';
import { newProgress, practise, dueItems } from '../../core/srs.js';
import * as store from '../../data/store.js';

export const MODES = {
  recall: { key: 'recall', label: 'Word → Pinyin & meaning', short: 'See the characters, recall the rest', icon: 'cards', color: 'var(--accent)' },
  recallReverse: { key: 'recallReverse', label: 'Pinyin & meaning → Word', short: 'Recall the characters, then check', icon: 'pencil', color: 'var(--purple)' },
  review: { key: 'review', label: 'Review', short: 'Words due today', icon: 'flame', color: 'var(--orange)' },
};

export const SCOPES = [
  { value: 'words', label: 'Words' },
  { value: 'chars', label: 'Characters' },
  { value: 'all', label: 'All' },
];

export const MAX_RETRIES = 2;
const SNAPSHOT_KEY = 'chinese-practice-1.session';
const SNAPSHOT_TTL = 24 * 60 * 60 * 1000;

const cardKey = (c) => `${c.type}:${c.itemId}:${c.dir || ''}`;

/* ---------- which entries are practised ---------- */

// Words and sentences are the entries at depth 0; the characters of a word and the chunks of a
// sentence are the "> " lines under them (depth 1 or 2).
export function inScope(entry, scope = 'words') {
  if (scope === 'all') return true;
  const depth = Number(entry?.depth) || 0;
  return scope === 'chars' ? depth > 0 : depth === 0;
}

export function practiceEntries(list, scope = 'words') {
  return (list?.entries || []).filter((e) => inScope(e, scope));
}

// "Pinyin & meaning → Word" needs something to show on the front of the card.
export const hasSideB = (entry) => !!(String(entry?.pinyin || '').trim() || String(entry?.meaning || '').trim());

// Cards for one list and mode. `itemIds` limits them to those entries (e.g. the mistakes).
export function buildCards(list, mode, { itemIds = null, scope = 'words', rng = Math.random } = {}) {
  const dir = mode === 'recallReverse' ? 'meaning' : 'word';
  const keep = (e) => (!itemIds || itemIds.includes(e.id)) && (dir === 'word' || hasSideB(e));
  const cards = practiceEntries(list, scope)
    .filter(keep)
    .map((e) => ({ listId: list.id, type: 'recall', itemId: e.id, dir }));
  return shuffle(cards, rng);
}

// A review asks each card in a random direction, so a word is practised both ways over time.
function randomDir(entry, rng) {
  return hasSideB(entry) && rng() < 0.5 ? 'meaning' : 'word';
}

// Every entry that has been practised keeps coming back when it is due, whatever the scope
// setting is now; entries never practised count only inside the scope.
function reviewable(entry, progress, scope) {
  return progress.has(entry.id) || inScope(entry, scope);
}

// Cards due today across all lists: entries being learned (missed or due) come before brand-new
// ones, so a big unpractised list never pushes mistakes out of the review.
export async function buildReviewCards({ limit = 20, now = Date.now(), rng = Math.random, scope = 'words' } = {}) {
  const lists = (await store.getLists()).filter((l) => (l.entries || []).length);
  const progress = await store.getProgress();
  const all = [];
  for (const list of lists) {
    for (const entry of list.entries) {
      if (!reviewable(entry, progress, scope)) continue;
      all.push({ list, entry, progress: progress.get(entry.id) || newProgress(entry.id, list.id) });
    }
  }
  const due = dueItems(all.map((x) => x.progress), now);
  const learning = due.filter((p) => progress.has(p.itemId));
  const fresh = due.filter((p) => !progress.has(p.itemId));
  const byId = new Map(all.map((x) => [x.entry.id, x]));
  const picked = [...learning, ...fresh].slice(0, limit).map((p) => byId.get(p.itemId)).filter(Boolean);
  const cards = picked.map(({ list, entry }) => ({ listId: list.id, type: 'recall', itemId: entry.id, dir: randomDir(entry, rng) }));
  return { cards: shuffle(cards, rng), lists, totalDue: due.length };
}

// `lists` / `progress` (Map itemId → Progress) can be passed in when the caller has them.
export async function countDue(now = Date.now(), { lists, progress, scope = 'words' } = {}) {
  lists = lists || (await store.getLists());
  progress = progress || (await store.getProgress());
  let due = 0;
  let fresh = 0;
  for (const list of lists) {
    for (const entry of list.entries || []) {
      const p = progress.get(entry.id);
      if (p) {
        if (p.due <= now) due++;
      } else if (inScope(entry, scope)) fresh++;
    }
  }
  return { due, fresh, total: due + fresh };
}

/* ---------- session state ---------- */

export function createSession({ mode, listId = null, title = '', cards }) {
  return {
    id: uid(),
    mode,
    listId,
    title,
    queue: cards.map((c) => ({ ...c, retry: 0 })),
    originalCount: cards.length,
    index: 0,
    done: 0, // original cards finished (right, or out of retries)
    outcomes: {}, // cardKey -> { itemId, listId, type, first: 'right'|'hinted'|'wrong', score }
    startedAt: Date.now(),
  };
}

export function currentCard(session) {
  return session.queue[session.index] || null;
}

// Records the result of the current card and moves on. Returns the session.
export function answer(session, result) {
  const card = currentCard(session);
  if (!card) return session;
  const key = cardKey(card);
  const outcome = result.correct ? (result.hinted ? 'hinted' : 'right') : 'wrong';
  if (!session.outcomes[key]) {
    session.outcomes[key] = {
      itemId: card.itemId,
      listId: card.listId,
      type: card.type,
      first: outcome,
      score: typeof result.score === 'number' ? result.score : result.correct ? 1 : 0,
    };
  }
  if (!result.correct && card.retry < MAX_RETRIES) {
    session.queue.push({ ...card, retry: card.retry + 1 });
  } else {
    session.done += 1;
  }
  session.index += 1;
  saveSnapshot(session);
  return session;
}

export function isFinished(session) {
  return session.index >= session.queue.length;
}

export function progressFraction(session) {
  return session.originalCount ? session.done / session.originalCount : 0;
}

export function summarize(session) {
  const outcomes = Object.values(session.outcomes);
  const total = outcomes.length;
  const right = outcomes.filter((o) => o.first === 'right').length;
  const hinted = outcomes.filter((o) => o.first === 'hinted').length;
  const wrong = outcomes.filter((o) => o.first === 'wrong');
  const missed = [];
  for (const o of wrong) {
    if (!missed.some((m) => m.itemId === o.itemId)) missed.push({ itemId: o.itemId, listId: o.listId });
  }
  return {
    sessionId: session.id,
    mode: session.mode,
    listId: session.listId,
    title: session.title,
    total,
    right,
    hinted,
    wrong: wrong.length,
    accuracy: total ? Math.round(((right + hinted) / total) * 100) : 0,
    missed,
    durationMs: Date.now() - session.startedAt,
  };
}

// Saves spaced repetition, history and lastPracticedAt. Answers for lists or entries deleted
// since the session started are skipped, so no orphan progress records are written.
export async function commit(session, now = Date.now()) {
  const summary = summarize(session);
  const outcomes = Object.values(session.outcomes);
  const lists = new Map();
  for (const id of new Set(outcomes.map((o) => o.listId).filter(Boolean))) {
    const list = await store.getList(id);
    if (list) lists.set(id, list);
  }
  const exists = (o) => !!lists.get(o.listId)?.entries?.some((e) => e.id === o.itemId);
  const perItem = new Map(); // itemId -> worst outcome across its cards
  const rank = { right: 0, hinted: 1, wrong: 2 };
  for (const o of outcomes) {
    if (!exists(o)) continue;
    const prev = perItem.get(o.itemId);
    if (!prev || rank[o.first] > rank[prev.first]) perItem.set(o.itemId, o);
  }
  if (perItem.size) {
    const existing = await store.getProgress([...perItem.keys()]);
    const updated = [...perItem.values()].map((o) => practise(existing.get(o.itemId) || newProgress(o.itemId, o.listId), o.first, now));
    await store.saveProgress(updated);
  }
  for (const list of lists.values()) {
    await store.saveList({ ...list, lastPracticedAt: now }, { touch: false });
  }
  if (summary.total) {
    await store.addHistory({ at: now, listId: session.listId, mode: session.mode, total: summary.total, correct: summary.right + summary.hinted });
  }
  clearSnapshot(session.id);
  return summary;
}

/* ---------- snapshot (resume after iOS closes the app) ---------- */

export function saveSnapshot(session) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), session }));
  } catch {
    /* ignore */
  }
}

// The stored session (finished or not), or null when there is none or it is too old.
function readSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (!raw || Date.now() - raw.at > SNAPSHOT_TTL || !raw.session || !Array.isArray(raw.session.queue)) return null;
    return raw.session;
  } catch {
    return null;
  }
}

// A paused session that can be resumed (not finished), or null.
export function getSnapshot() {
  const session = readSnapshot();
  return session && !isFinished(session) ? session : null;
}

// Without an id: removes the saved session. With an id: only when the saved session is that
// one (closing a new session must not erase a paused one).
export function clearSnapshot(id) {
  try {
    if (id !== undefined && readSnapshot()?.id !== id) return;
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

// Whether a card can still be shown: its list and entry exist. `lists`: Map<listId, list>.
export function cardResolves(card, lists) {
  const list = lists.get(card.listId);
  return !!list?.entries?.some((e) => e.id === card.itemId);
}

// The cards still to do that can be shown (lists may have been edited or deleted meanwhile).
export function liveCards(session, lists) {
  return session.queue.slice(session.index).filter((c) => cardResolves(c, lists));
}

const hasOutcomes = (session) => Object.keys(session.outcomes || {}).length > 0;

// Saves `session`'s answers and removes its snapshot. If saving fails the snapshot is put back,
// so the next launch can try again.
async function commitSnapshot(session) {
  clearSnapshot(session.id);
  if (!hasOutcomes(session)) return;
  try {
    await commit(session);
  } catch (err) {
    console.error('Could not save the paused session', err);
    if (!readSnapshot()) saveSnapshot(session);
  }
}

// A saved session that can no longer continue (every card answered, or its remaining cards
// deleted) is saved and cleared. Runs at launch and whenever Today finds such a snapshot.
let recovering = null;
export function recoverSnapshot() {
  if (recovering) return recovering;
  recovering = (async () => {
    const session = readSnapshot();
    if (!session) return false;
    if (!isFinished(session)) {
      const lists = new Map();
      for (const id of new Set(session.queue.map((c) => c.listId))) {
        const list = await store.getList(id);
        if (list) lists.set(id, list);
      }
      if (liveCards(session, lists).length) return false;
    }
    await commitSnapshot(session);
    return true;
  })().finally(() => {
    recovering = null;
  });
  return recovering;
}

// There is one snapshot slot, so the first answer in a new session would overwrite a different
// paused session: save that one's answers first.
export function commitPausedSession(currentId) {
  const paused = readSnapshot();
  if (!paused || paused.id === currentId) return null;
  return commitSnapshot(paused);
}
