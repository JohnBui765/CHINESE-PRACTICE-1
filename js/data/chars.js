// The two character lists the check marks use, loaded once from data/ (cached offline by the
// service worker): the 3,500 common characters and the characters both fonts have.
let promise = null;

async function readSet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  return new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
}

// Resolves with { common, fonts }, or null when the files cannot be read (the app still works,
// it just shows no character warnings).
export function charSets() {
  if (!promise) {
    promise = Promise.all([readSet('data/common3500.txt'), readSet('data/font-chars.txt')])
      .then(([common, fonts]) => ({ common, fonts }))
      .catch((err) => {
        console.warn('Character lists not available', err);
        return null;
      });
  }
  return promise;
}
