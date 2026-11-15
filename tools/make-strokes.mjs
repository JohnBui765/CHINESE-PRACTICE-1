// Builds the stroke-order data the app ships: data/strokes/<block>.json and data/stroke-chars.txt.
// Source: animCJK's graphicsZhHans.txt (mainland-Chinese stroke order, Make Me a Hanzi format),
// pinned to one commit and checked against its SHA-256, so the build is repeatable. Only the
// 3,500 common characters (data/common3500.txt) are kept, as agreed with the owner.
// Usage: node tools/make-strokes.mjs   (downloads the source once into tools/cache/)
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockName, dataProblem } from '../js/core/strokes.js';

const COMMIT = 'c63765b150cbd567c71d05cf4a4f8d00b57045c9';
const SOURCE_URL = `https://raw.githubusercontent.com/parsimonhi/animCJK/${COMMIT}/graphicsZhHans.txt`;
const SOURCE_SHA256 = '3bb2150fe12edc7d82e18df0044c3e942aca6b8f399f8fd17aa0eee5197cbd62';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheFile = join(root, 'tools', 'cache', `graphicsZhHans-${COMMIT.slice(0, 7)}.txt`);
const outDir = join(root, 'data', 'strokes');

async function source() {
  try {
    return await readFile(cacheFile, 'utf8');
  } catch {
    /* not cached yet */
  }
  console.log('downloading', SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const text = await res.text();
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, text);
  return text;
}

const text = await source();
const sha = createHash('sha256').update(text).digest('hex');
if (sha !== SOURCE_SHA256) throw new Error(`graphicsZhHans.txt does not match the pinned commit (sha256 ${sha})`);

const wanted = new Set((await readFile(join(root, 'data', 'common3500.txt'), 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
const blocks = new Map(); // block name -> { char: { s, m } }
const found = new Set();
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  const ch = d.character;
  if (!wanted.has(ch)) continue;
  const record = { s: d.strokes, m: d.medians };
  const problem = dataProblem(record);
  if (problem) throw new Error(`${ch}: ${problem}`);
  const name = blockName(ch);
  if (!blocks.has(name)) blocks.set(name, {});
  blocks.get(name)[ch] = record;
  found.add(ch);
}
const missing = [...wanted].filter((c) => !found.has(c));

await mkdir(outDir, { recursive: true });
for (const f of await readdir(outDir)) if (f.endsWith('.json')) await rm(join(outDir, f));
let bytes = 0;
for (const [name, chars] of [...blocks].sort()) {
  const json = JSON.stringify(chars);
  bytes += Buffer.byteLength(json);
  await writeFile(join(outDir, `${name}.json`), json);
}
const list = [...found].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('\n') + '\n';
await writeFile(join(root, 'data', 'stroke-chars.txt'), list);
console.log(`stroke data: ${found.size} characters in ${blocks.size} files, ${(bytes / 1e6).toFixed(1)} MB; missing ${missing.length}${missing.length ? ': ' + missing.join('') : ''}`);
