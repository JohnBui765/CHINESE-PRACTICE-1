// Offline support. The PRECACHE list and VERSION are rewritten by `node tools/update-sw.mjs`:
// run it after changing any app file, so installed apps pick up the new version.
//
// All my web apps share one origin (johnbui765.github.io), so they share Cache Storage. Every
// cache of this app is named "chinese-practice-1-<VERSION>", it is opened by name (never
// caches.match(), which searches every app's caches), and on activate only caches that start
// with "chinese-practice-1-" are deleted. Other apps' caches are never touched.
const VERSION = '7b26cda1cc';
const PRECACHE = [
  './',
  'css/app.css',
  'css/screens/hanzi.css',
  'css/screens/lists.css',
  'css/screens/mode-flashcard.css',
  'css/screens/practice.css',
  'css/screens/settings.css',
  'css/screens/today.css',
  'data/common3500.txt',
  'data/font-chars.txt',
  'fonts/noto-sans-sc.ttf',
  'fonts/ukai-cn.ttf',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
  'icons/maskable-512.png',
  'index.html',
  'js/app.js',
  'js/core/extract.js',
  'js/core/listedit.js',
  'js/core/lists.js',
  'js/core/pinyin.js',
  'js/core/srs.js',
  'js/core/text.js',
  'js/core/util.js',
  'js/data/chars.js',
  'js/data/db.js',
  'js/data/sample.js',
  'js/data/store.js',
  'js/screens/import.js',
  'js/screens/index.js',
  'js/screens/list-detail.js',
  'js/screens/lists.js',
  'js/screens/practice/practice.js',
  'js/screens/practice/recall.js',
  'js/screens/practice/results.js',
  'js/screens/practice/session.js',
  'js/screens/settings.js',
  'js/screens/today.js',
  'js/ui/clipboard.js',
  'js/ui/components.js',
  'js/ui/dom.js',
  'js/ui/files.js',
  'js/ui/icons.js',
  'js/ui/router.js',
  'js/ui/viewport.js',
  'manifest.webmanifest',
  'prompts/examples.txt',
  'prompts/pinyin-meaning.txt',
  'prompts/sentences.txt',
  'prompts/worksheet.txt',
];

const PREFIX = 'chinese-practice-1-';
const CACHE = `${PREFIX}${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// The page offers "Update" when a new version is waiting; tapping it sends this message.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// The same response without the "redirected" mark.
async function plainCopy(response) {
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App navigations always get the cached shell (works offline). Some hosts answer index.html
  // with a redirect to ./, and a browser refuses to show a page from a redirected response, so
  // ./ is tried first and a redirected copy is turned into a plain one.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match('./')) || (await cache.match('index.html'));
        if (cached && cached.redirected) return plainCopy(cached);
        if (cached) return cached;
        return fetch(request);
      })(),
    );
    return;
  }

  // Static files: cache first, then network (and remember the response).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
