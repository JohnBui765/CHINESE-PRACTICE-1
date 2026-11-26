// "Match the meanings": which entries can be matched, how they are dealt into boards, the board
// of missed entries that comes back at the end, and which tapped pair counts as a match.
// A card is a board: { listId, type: 'match', itemIds: [...] } (lesson order). No browser APIs.
import { chineseChars } from './extract.js';
import { sameMeaning } from './lists.js';
import { shuffle } from './util.js';

export const BOARD_MAX = 7; // pairs on a board
export const BOARD_MIN = 4; // a smaller board is topped up (missed entries, "Practise mistakes")
const MAX_CHARS = 6;

// An entry with a meaning and 1 to 6 Chinese characters (short sentences such as 不客气。 too).
export function canMatch(entry) {
  const n = [...chineseChars(entry?.word || '')].length;
  return n >= 1 && n <= MAX_CHARS && !!String(entry?.meaning || '').trim();
}

// Two entries that must not share a board: the learner could not tell them apart. The same
// characters (国 the word, and 国 under 中国), or a meaning in common (奶 and 牛奶: "milk").
export function clash(a, b) {
  return chineseChars(a?.word || '') === chineseChars(b?.word || '') || sameMeaning(a, b);
}

// Whether the Chinese of `zh` and the meaning of `en` make a pair. Two entries that clash and
// still ended up on one board (when it could not be avoided) are accepted either way.
export function isPair(zh, en) {
  return !!zh && !!en && (zh.id === en.id || clash(zh, en));
}

// Splits entries into boards of at most 7, as even as possible: 10 -> 5 + 5, 13 -> 7 + 6,
// 19 -> 7 + 6 + 6. The entries are shuffled, then each goes on the board with the most room
// where nothing clashes with it; when every board with room has a clash, the one with the most
// room takes it anyway. `spare`: entries that may top a board up to 4 ("Practise mistakes"); they
// clash with nothing on it. Each board is in lesson order (`lesson`: all the list's entries).
// -> [[ids]]
export function makeBoards(entries, { rng = Math.random, spare = [], lesson = entries, max = BOARD_MAX, min = BOARD_MIN } = {}) {
  if (!entries.length || entries.length + spare.length < 2) return [];
  const count = Math.ceil(entries.length / max);
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(entries.length / count) + (i < entries.length % count ? 1 : 0));
  const boards = sizes.map(() => []);
  const room = (i) => sizes[i] - boards[i].length;
  const roomiest = (list) => list.reduce((best, i) => (room(i) > room(best) ? i : best), list[0]);
  for (const e of shuffle(entries, rng)) {
    const open = boards.map((_, i) => i).filter((i) => room(i) > 0);
    const free = open.filter((i) => !boards[i].some((x) => clash(x, e)));
    boards[roomiest(free.length ? free : open)].push(e);
  }
  const extra = shuffle(spare, rng);
  const used = new Set();
  for (const board of boards) {
    for (const e of extra) {
      if (board.length >= min) break;
      if (used.has(e.id) || board.some((x) => clash(x, e))) continue;
      board.push(e);
      used.add(e.id);
    }
  }
  const order = new Map(lesson.map((e, i) => [e.id, i]));
  const at = (e) => order.get(e.id) ?? lesson.length;
  return boards.map((board) => board.sort((a, b) => at(a) - at(b)).map((e) => e.id));
}

// The board that comes back at the end: the entries missed, topped up to 4 with entries of the
// same board that were matched (picked at random), in the board's order.
export function retryBoard(itemIds, missedIds, { rng = Math.random, min = BOARD_MIN } = {}) {
  const missed = itemIds.filter((id) => missedIds.includes(id));
  const matched = shuffle(itemIds.filter((id) => !missedIds.includes(id)), rng);
  const keep = new Set([...missed, ...matched.slice(0, Math.max(0, min - missed.length))]);
  return itemIds.filter((id) => keep.has(id));
}
