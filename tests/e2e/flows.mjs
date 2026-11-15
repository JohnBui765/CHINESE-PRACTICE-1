// End-to-end check in Chromium at iPhone size: the app serves at the GitHub Pages path, the
// sample list loads, a recall session runs to its results, a list is pasted in, the manifest id
// resolves to the repository path, the service worker caches under the app's own prefix, the app
// works offline, and other apps' caches are left alone. Screenshots go to tests/output/.
// Usage: node tests/e2e/flows.mjs   (needs Playwright + Chromium)
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 8123;
const PATH = '/CHINESE-PRACTICE-1/';
const BASE = `http://localhost:${PORT}${PATH}`;
const OUT = new URL('../output/', import.meta.url);
const root = new URL('../../', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, OUT));

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT), `--base=${PATH}`], { cwd: root, stdio: 'ignore' });
let browser;
try {
  await waitForServer(BASE);
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB' });
  const page = await context.newPage();
  const errors = [];
  // The router ignores taps while a screen transition runs (#app gets the class "busy").
  const idle = () => page.locator('#app:not(.busy)').waitFor({ state: 'attached' });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. First run: onboarding, then the sample list.
  await page.goto(BASE);
  await page.getByText('Practise what you learnt').waitFor();
  await page.screenshot({ path: shot('01-today-first-run.png') });
  await page.getByRole('button', { name: 'Try a sample list' }).click();
  await page.getByText('10 words · 9 characters').first().waitFor();
  await page.getByText('超市').first().waitFor();
  await page.screenshot({ path: shot('02-list.png'), fullPage: false });

  // 2. A recall session: show the answer, grade, until the results screen.
  await page.getByText('Word → Pinyin & meaning').click();
  await page.locator('.fc-card').waitFor();
  await page.screenshot({ path: shot('03-card-front.png') });
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.waitForTimeout(400);
    if (i === 0) await page.screenshot({ path: shot('04-card-back.png') });
    await page.getByRole('button', { name: i === 2 ? "Didn't know" : 'Knew it' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(500);
  }
  // The missed card comes back once more.
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Knew it' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Great work!').waitFor();
  await page.getByText('90%').waitFor();
  await page.screenshot({ path: shot('05-results.png') });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Learning').first().waitFor();

  // 3. Back on Today (the sample list was opened from there): the stats and the review card.
  await idle();
  await page.locator('.nav-back').first().click();
  await page.getByText('day streak').waitFor();
  await page.getByText('mastered', { exact: true }).waitFor();
  await page.screenshot({ path: shot('06-today.png') });

  // 4. Paste a list (the Bài 7 lesson) and save it.
  await idle();
  await page.locator('.screen:not(.covered) .tabbar').getByText('Lists').click();
  await idle();
  await page.getByRole('button', { name: 'New list' }).click();
  const text = await readFile(new URL('tests/fixtures/bai7.txt', root), 'utf8');
  await page.locator('.imp-text').fill(text);
  await page.getByRole('button', { name: /Save 10 words · 9 characters/ }).click();
  await page.getByText('Bài 7').first().waitFor();
  await page.getByText('牛奶').first().waitFor();
  await idle();
  await page.locator('.nav-back').first().click();
  await idle();
  await page.getByText('2 lists').waitFor();

  // 5. Manifest id, service worker cache prefix, other apps' caches, offline.
  const manifest = await (await fetch(`${BASE}manifest.webmanifest`)).json();
  assert.equal(new URL(manifest.id, BASE).pathname, PATH, 'manifest id resolves to the repository path');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('chinese-practice-1-')), null, { timeout: 15000 });
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.every((k) => k.startsWith('chinese-practice-1-')), `only this app's caches were made: ${keys.join(', ')}`);
  // Other apps' caches (and an old cache of this app) exist; after a fresh activation only the old one of this app is gone.
  await page.evaluate(async () => {
    await (await caches.open('otherapp-v1')).put('/x', new Response('x'));
    await (await caches.open('hanzigrid-v1')).put('/x', new Response('x'));
    await (await caches.open('chinese-practice-1-old')).put('/x', new Response('x'));
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.unregister();
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.waitForFunction(async () => !(await caches.keys()).includes('chinese-practice-1-old'), null, { timeout: 15000 });
  const after = await page.evaluate(() => caches.keys());
  assert.ok(after.includes('otherapp-v1') && after.includes('hanzigrid-v1'), `other caches untouched: ${after.join(', ')}`);
  assert.ok(!after.includes('chinese-practice-1-old'), 'the old cache of this app is deleted');
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('chinese-practice-1-') && k !== 'chinese-practice-1-old');
    const cache = await caches.open(name);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  for (const f of ['fonts/ukai-cn.ttf', 'fonts/noto-sans-sc.ttf', 'data/common3500.txt', 'js/app.js', 'css/app.css']) {
    assert.ok(cached.includes(PATH + f), `${f} is precached`);
  }
  // Offline: the app still opens, with the lists.
  await context.setOffline(true);
  await page.reload();
  await page.locator('.screen:not(.covered) .tabbar').waitFor();
  await idle();
  await page.screenshot({ path: shot('07-offline.png') });
  await page.locator('.screen:not(.covered) .tabbar').getByText('Lists').click();
  await page.getByText('2 lists').waitFor();
  const fontOk = await page.evaluate(async () => (await document.fonts.load('30px "Hanzi Kai"')).length > 0);
  assert.equal(fontOk, true, 'the KaiTi font is available offline');
  await context.setOffline(false);
  await page.evaluate(async () => {
    for (const k of ['otherapp-v1', 'hanzigrid-v1']) await caches.delete(k);
  });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('e2e: all flows passed; screenshots in tests/output/');
} finally {
  if (browser) await browser.close();
  server.kill();
}
