// Practice screen: a full-screen modal that runs a session card by card. A mode module (recall)
// renders the card body; this screen owns the header, the footer (Show answer → grade buttons →
// Continue) and moving between cards. Taken from Vocab Studio.
import { h, reducedMotion } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, progressBar, emptyState, alert, iconButton, hasOpenOverlay, toast } from '../../ui/components.js';
import { pop, replace } from '../../ui/router.js';
import * as store from '../../data/store.js';
import { strokeChars as loadStrokeChars, strokeData } from '../../data/strokes.js';
import { MODES, buildCards, buildReviewCards, createSession, currentCard, answer, isFinished, progressFraction, commit, summarize, getSnapshot, clearSnapshot, liveCards, cardResolves, recoverSnapshot, commitPausedSession, hasSideB } from './session.js';
import * as recall from './recall.js';
import * as write from './write.js';

const RENDERERS = { recall, write };
const PRAISE = ['Correct!', 'Nice!', 'Great!', 'Well done!', 'Spot on!'];
// After the footer changes (Show answer → grade buttons, a new card), taps are ignored this long:
// the second tap of a double tap would otherwise hit the button that just took the first one's place.
const SETTLE_MS = 350;

// params:
//   { listId, mode }                     practise one list in a mode (recall | recallReverse)
//   { listId, mode, itemIds }            only these entries (e.g. the mistakes)
//   { mode: 'review' }                   cards due today across lists
//   { mode: 'review', missed: [{ itemId, listId }] }   review the mistakes again
//   { resume: true }                     continue the saved session
export default async function create(params) {
  const settings = store.settings();
  const lists = new Map();
  let session = null;
  let emptyMessage = null;

  if (params.resume) {
    const snap = getSnapshot();
    if (snap) {
      for (const id of new Set(snap.queue.map((c) => c.listId))) {
        const l = await store.getList(id);
        if (l) lists.set(id, l);
      }
      if (liveCards(snap, lists).length) session = snap;
      else {
        recoverSnapshot().catch((err) => console.error(err));
        emptyMessage = { title: 'Nothing to resume', message: 'The words in that session were changed or deleted. Your answers have been saved.' };
      }
    } else {
      emptyMessage = { title: 'Nothing to resume', message: 'That session has already finished.' };
    }
  } else if (params.mode === 'review') {
    let { cards, lists: all } = await buildReviewCards({ limit: settings.reviewLimit || 20, scope: settings.scope });
    all.forEach((l) => lists.set(l.id, l));
    if (params.missed?.length) {
      const out = [];
      for (const m of params.missed) {
        const list = lists.get(m.listId) || (await store.getList(m.listId));
        if (!list) continue;
        lists.set(list.id, list);
        const entry = list.entries.find((e) => e.id === m.itemId);
        if (entry) out.push({ listId: list.id, type: 'recall', itemId: entry.id, dir: hasSideB(entry) && Math.random() < 0.5 ? 'meaning' : 'word' });
      }
      cards = out;
    }
    if (cards.length) session = createSession({ mode: 'review', title: 'Review', cards });
    else emptyMessage = { title: 'All caught up', message: 'Nothing is due right now. Come back tomorrow, or practise a list.' };
  } else {
    const list = await store.getList(params.listId);
    if (!list) {
      emptyMessage = { title: 'List not found', message: 'It may have been deleted.' };
    } else {
      lists.set(list.id, list);
      const strokeChars = params.mode === 'write' ? await loadStrokeChars() : null;
      const cards = buildCards(list, params.mode, { itemIds: params.itemIds || null, scope: params.scope || settings.scope, strokeChars });
      if (cards.length) session = createSession({ mode: params.mode, listId: list.id, title: list.name, cards });
      else if (params.mode === 'recallReverse') emptyMessage = { title: 'No pinyin or meanings yet', message: 'This mode shows the pinyin and meaning first. Add them to the list (Edit list), then try again.', icon: 'eye' };
      else if (params.mode === 'write') emptyMessage = { title: 'Nothing to write here', message: 'Writing works for words of 1 to 4 characters that have stroke data (the 3,500 common characters). Change what to practise, or pick another list.', icon: 'pencil' };
      else emptyMessage = { title: 'Nothing to practise', message: 'Change what to practise (Words, Characters or All) on the list page.' };
    }
  }

  // The stroke data of the writing cards, fetched once here so a card never waits for it.
  const strokes = new Map();
  if (session) {
    const chars = new Set(session.queue.filter((c) => c.type === 'write').flatMap((c) => c.chars || []));
    await Promise.all([...chars].map(async (ch) => strokes.set(ch, await strokeData(ch))));
  }

  /* ---------- layout ---------- */
  const bar = progressBar(session ? progressFraction(session) : 0);
  const counter = h('span', { class: 'pt-count tabular' });
  const closeBtn = iconButton({ icon: 'close', label: 'End practice', variant: 'gray', onTap: () => (session ? requestClose() : pop()) });
  const top = h('header', { class: 'practice-top' }, closeBtn, h('div', { class: 'pt-progress' }, bar.el), counter);
  const stage = h('div', { class: 'practice-stage' });
  const scroller = h('div', { class: 'scroll practice-scroll' }, stage);

  const fbIcon = h('span', { class: 'pf-icon' });
  const fbTitle = h('div', { class: 'pf-title' });
  const fbDetail = h('div', { class: 'pf-detail' });
  const feedback = h('div', { class: 'pf-feedback', 'aria-live': 'polite' }, fbIcon, h('div', { class: 'pf-text' }, fbTitle, fbDetail));
  const primary = button({ label: 'Show answer', size: 'large', block: true, onTap: () => (session ? onPrimary() : pop()) });
  const primaryLabel = primary.querySelector('span');
  const timerBar = h('div', { class: 'pf-timer' });
  primary.appendChild(timerBar);
  const knewBtn = button({ label: 'Knew it', variant: 'success', size: 'large', block: true, icon: 'check', onTap: () => grade(true) });
  const forgotBtn = button({ label: "Didn't know", variant: 'destructive', size: 'large', block: true, icon: 'close', onTap: () => grade(false) });
  const gradeRow = h('div', { class: 'pf-grade' }, forgotBtn, knewBtn);
  const footer = h('footer', { class: 'practice-footer', dataset: { state: 'idle' } }, feedback, h('div', { class: 'pf-actions' }, primary, gradeRow));

  const el = h('section', { class: 'screen practice' }, top, scroller, footer);

  let state = 'idle'; // idle | right | close | wrong | grade | finishing | empty
  let current = null; // the mode renderer's object for the current card
  let currentEl = null;
  let autoTimer = null;
  let settleUntil = 0;
  let settleTimer = 0;
  let shown = false; // the router has put this screen on the page
  let finishPending = false;
  let committing = null; // Promise<{ summary, saved }> once saving has started
  let pausedSave = null; // saving an older paused session (see commitPausedSession)

  if (!session) {
    scroller.replaceChildren(emptyState({ icon: emptyMessage.icon || 'checkCircle', title: emptyMessage.title, message: emptyMessage.message }));
    primaryLabel.textContent = 'Close';
    footer.dataset.state = 'empty';
    counter.textContent = '';
    return { el, title: 'Practice', swipeBack: false };
  }

  /* ---------- card flow ---------- */

  function setPrimary(label, { ready = true, tone = 'primary' } = {}) {
    primaryLabel.textContent = label;
    primary.disabled = !ready;
    primary.classList.remove('primary', 'success', 'danger');
    primary.classList.add(tone);
  }

  function setState(next, fb = {}) {
    state = next;
    footer.dataset.state = next;
    settle();
    if (answered()) {
      fbIcon.replaceChildren(icon(next === 'right' ? 'checkCircle' : next === 'close' ? 'pencil' : 'xCircle', { size: 26 }));
      fbTitle.textContent = fb.title || '';
      fbDetail.textContent = fb.detail || '';
      fbDetail.hidden = !fb.detail;
    }
  }

  // Blocks the footer buttons for SETTLE_MS (the CSS class makes taps fall through to the
  // footer; the time check also covers Enter and card taps).
  function settle() {
    settleUntil = performance.now() + SETTLE_MS;
    footer.classList.add('settling');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => footer.classList.remove('settling'), SETTLE_MS);
  }

  const settling = () => performance.now() < settleUntil;
  // The card has a result and the footer shows Continue.
  const answered = () => state === 'right' || state === 'close' || state === 'wrong';

  function updateHeader() {
    bar.set(progressFraction(session));
    counter.textContent = `${Math.min(session.done, session.originalCount)}/${session.originalCount}`;
  }

  function makeCtx(card, list, item) {
    return {
      card,
      list,
      item,
      entries: list.entries,
      settings: store.settings(),
      strokes,
      retry: card.retry,
      rng: Math.random,
      setReady: (ready) => {
        if (state === 'idle') primary.disabled = !ready;
      },
      setPrimaryLabel: (label) => {
        if (state === 'idle') primaryLabel.textContent = label;
      },
      submit: () => onPrimary(),
      showGradeButtons: () => {
        if (state !== 'idle') return;
        setState('grade');
      },
    };
  }

  function mount(node) {
    const old = currentEl;
    currentEl = node;
    node.classList.add('practice-card');
    stage.appendChild(node);
    scroller.scrollTop = 0;
    if (current.focus && el.isConnected) current.focus();
    if (old) {
      if (reducedMotion()) {
        old.remove();
      } else {
        old.classList.add('leaving');
        const out = old.animate([{ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: 'translate3d(-48px,0,0)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
        out.finished.then(() => old.remove(), () => old.remove());
        node.animate([{ transform: 'translate3d(56px,0,0)', opacity: 0 }, { transform: 'translate3d(0,0,0)', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', delay: 60, fill: 'backwards' });
      }
    }
  }

  function showCard() {
    clearAuto();
    let card = currentCard(session);
    // Skip cards whose entry was deleted since the session started.
    while (card) {
      if (cardResolves(card, lists)) break;
      session.index += 1;
      session.done += 1;
      card = currentCard(session);
    }
    if (!card) {
      // Never navigate while the router is still building this screen.
      if (shown) finish();
      else finishPending = true;
      return;
    }
    const list = lists.get(card.listId);
    const item = list.entries.find((e) => e.id === card.itemId);
    if (current?.destroy) current.destroy();
    setState('idle');
    const renderer = RENDERERS[card.type] || recall;
    current = renderer.render(card, makeCtx(card, list, item));
    setPrimary(current.primaryLabel || 'Show answer', { ready: !!current.readyInitially });
    if (card.retry) current.el.prepend(h('div', { class: 'retry-tag' }, icon('refresh', { size: 14 }), 'Try again'));
    mount(current.el);
    updateHeader();
  }

  function onResult(result) {
    if (!result || state !== 'idle') return;
    currentEl.classList.add('checked');
    const fb = result.feedback || {};
    const title = result.correct ? fb.title || (result.hinted ? 'Correct — with a hint' : PRAISE[Math.floor(Math.random() * PRAISE.length)]) : fb.title || 'Not quite';
    setState(result.correct ? 'right' : result.close ? 'close' : 'wrong', { title, detail: fb.detail });
    if (!Object.keys(session.outcomes).length) pausedSave = commitPausedSession(session.id);
    answer(session, result);
    // Save as soon as the last card is answered: iOS may close the app before Continue is tapped.
    if (isFinished(session)) saveSession();
    updateHeader();
    setPrimary('Continue');
    const s = store.settings();
    if (s.autoAdvance > 0 && !result.noAutoAdvance) startAuto(s.autoAdvance * 1000);
  }

  function grade(correct) {
    if (state !== 'grade' || settling()) return;
    state = 'idle';
    onResult(current.grade ? current.grade(correct) : { correct });
  }

  function onPrimary() {
    if (settling()) return;
    if (state === 'idle') {
      if (primary.disabled) return;
      const result = current.check();
      if (result) onResult(result);
    } else if (answered()) {
      next();
    }
  }

  function next() {
    clearAuto();
    if (isFinished(session)) return finish();
    showCard();
  }

  function startAuto(ms) {
    timerBar.style.transition = 'none';
    timerBar.style.transform = 'scaleX(0)';
    timerBar.getBoundingClientRect();
    timerBar.style.transition = `transform ${ms}ms linear`;
    timerBar.style.transform = 'scaleX(1)';
    autoTimer = setTimeout(() => {
      // Never move on under an alert (e.g. "End this session?").
      if (hasOpenOverlay()) clearAuto();
      else next();
    }, ms);
  }

  function clearAuto() {
    clearTimeout(autoTimer);
    autoTimer = null;
    timerBar.style.transition = 'none';
    timerBar.style.transform = 'scaleX(0)';
  }

  // Starts saving once; later calls get the same promise.
  function saveSession() {
    if (!committing) {
      // Let an older paused session finish saving first: both may update the same entry.
      committing = Promise.resolve(pausedSave)
        .catch(() => {})
        .then(() => commit(session))
        .then(
          (summary) => ({ summary, saved: true }),
          (err) => {
            console.error('Could not save the session', err);
            return { summary: summarize(session), saved: false };
          },
        );
    }
    return committing;
  }

  async function finish() {
    if (state === 'finishing') return;
    state = 'finishing';
    clearAuto();
    const { summary, saved } = await saveSession();
    if (!saved) toast('Could not save this session. Your answers are kept; open the app again to save.', { icon: 'xCircle', tone: 'red', duration: 4000 });
    // The router may be busy for a moment; never leave a dead screen behind.
    for (let tries = 0; tries < 10; tries++) {
      if (!el.isConnected) return;
      if (await replace('results', { summary })) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    closing = true;
    if (!(await pop({ force: true }))) closing = false;
  }

  let closing = false;
  async function requestClose() {
    if (state === 'finishing' || closing) return;
    clearAuto();
    const answeredCount = Object.keys(session.outcomes).length;
    if (!answeredCount) {
      clearSnapshot(session.id);
      closing = true;
      const left = await pop();
      if (!left) closing = false;
      return;
    }
    const choice = await alert({
      title: 'End this session?',
      message: 'Your answers so far will be saved.',
      actions: [
        { label: 'Keep going', value: 'stay', style: 'cancel' },
        { label: 'End session', value: 'end', style: 'destructive' },
      ],
    });
    if (choice === 'end') finish();
  }

  // Enter key (iPad / desktop keyboards) outside text fields.
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.isComposing || hasOpenOverlay()) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    e.preventDefault();
    if (state === 'grade') return;
    onPrimary();
  };
  document.addEventListener('keydown', onKey);

  showCard();

  return {
    el,
    title: session.title || MODES[session.mode]?.label || 'Practice',
    swipeBack: false,
    onShow({ first } = {}) {
      shown = true;
      if (finishPending) {
        finishPending = false;
        finish();
        return;
      }
      if (first && state === 'idle' && current?.focus) current.focus();
    },
    beforeLeave() {
      if (closing || state === 'finishing') return true;
      if (!Object.keys(session.outcomes).length) {
        clearSnapshot(session.id);
        return true;
      }
      requestClose();
      return false;
    },
    onDestroy() {
      clearAuto();
      clearTimeout(settleTimer);
      document.removeEventListener('keydown', onKey);
      if (current?.destroy) current.destroy();
    },
  };
}
