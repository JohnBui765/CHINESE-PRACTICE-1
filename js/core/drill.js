// "Write it": the order of the writing steps for one word, and what happens after each write.
// No browser APIs: Node tests import this.
//
// Round 1 traces every character over its grey outline. Round 2 writes every character from
// memory; doing all the tracing first puts a short gap before each recall, which helps memory.
// A from-memory write with a mistake (or with help) adds a Copy step (a model beside the box) and
// another from-memory try for that character, up to MAX_TRIES tries from memory; after that the
// drill moves on. Round 3 writes the whole word from memory (words of 2 or more characters), up
// to WORD_TRIES tries.
//
// A step is { kind, char }: kind 'trace' | 'copy' | 'memory' | 'word'; char is the index of the
// character (null for 'word').

export const MAX_TRIES = 3;
export const WORD_TRIES = 2;

export function startDrill(count, { skipTrace = false } = {}) {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  const queue = [];
  if (!skipTrace) for (let i = 0; i < n; i++) queue.push({ kind: 'trace', char: i });
  for (let i = 0; i < n; i++) queue.push({ kind: 'memory', char: i });
  if (n > 1) queue.push({ kind: 'word', char: null });
  return {
    count: n,
    queue,
    index: 0, // the step being written
    tries: new Array(n).fill(0), // from-memory tries of each character
    clean: new Array(n).fill(null), // true: written from memory without a mistake; false: gave up
    wordTries: 0,
    wordClean: null,
  };
}

export const currentStep = (drill) => drill.queue[drill.index] || null;
export const isDone = (drill) => drill.index >= drill.queue.length;

// Which round a step belongs to, for the progress line: 1 trace, 2 from memory (and copy), 3 word.
export const roundOf = (step) => (!step ? 0 : step.kind === 'trace' ? 1 : step.kind === 'word' ? 3 : 2);

// Records the write that just ended and returns the drill with the next step current.
// `clean`: no wrong stroke and no help (no hint, no outline). Trace and copy steps always move on.
export function record(drill, { clean = false } = {}) {
  const step = currentStep(drill);
  if (!step) return drill;
  const next = { ...drill, queue: [...drill.queue], tries: [...drill.tries], clean: [...drill.clean], index: drill.index + 1 };
  if (step.kind === 'memory') {
    const i = step.char;
    next.tries[i] += 1;
    if (clean) next.clean[i] = true;
    else if (next.tries[i] < MAX_TRIES) next.queue.splice(next.index, 0, { kind: 'copy', char: i }, { kind: 'memory', char: i });
    else next.clean[i] = false;
  } else if (step.kind === 'word') {
    next.wordTries += 1;
    if (clean) next.wordClean = true;
    else if (next.wordTries < WORD_TRIES) next.queue.splice(next.index, 0, { kind: 'word', char: null });
    else next.wordClean = false;
  }
  return next;
}

// "I know it": the tracing still to come is skipped.
export function skipTracing(drill) {
  return { ...drill, queue: drill.queue.filter((step, i) => i < drill.index || step.kind !== 'trace') };
}

// For the end screen: each character's from-memory result, the whole word's, and whether every
// write from memory was right the first time.
export function summary(drill) {
  const chars = drill.tries.map((tries, i) => ({ index: i, tries, clean: drill.clean[i] === true }));
  const word = drill.count > 1 ? { tries: drill.wordTries, clean: drill.wordClean === true } : null;
  const perfect = chars.every((c) => c.clean && c.tries === 1) && (!word || (word.clean && word.tries === 1));
  return { chars, word, perfect };
}
