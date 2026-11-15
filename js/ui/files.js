// Files: save one (Share sheet on a phone, download elsewhere), pick one, read a text file.
import { h } from './dom.js';

// True on a phone or tablet that can share this file (iPhone: Save to Files, Print, AirDrop).
export function canShareFile(file) {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return Boolean(touch && navigator.canShare && navigator.canShare({ files: [file] }));
}

// Save a file. Must be called directly from a tap: iPhone only allows the Share sheet then.
export function saveFile(blob, fileName) {
  const file = new File([blob], fileName, { type: blob.type });
  if (canShareFile(file)) {
    return navigator.share({ files: [file], title: fileName }).catch((error) => {
      // The owner closed the Share sheet: not an error.
      if (error && error.name === 'AbortError') return;
      throw error;
    });
  }
  // Windows (and anything else): an ordinary download into the Downloads folder.
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: fileName, style: { display: 'none' } });
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 60_000);
  return Promise.resolve();
}

// Opens the file picker; resolves with the File, or null when nothing was chosen.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    const done = () => {
      const file = (input.files && input.files[0]) || null;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', done);
    input.addEventListener('cancel', done);
    document.body.appendChild(input);
    input.click();
  });
}

// Reads a text file. Lists saved by Hanzi Grid are UTF-8; files from Windows editors may be
// UTF-16 (with a byte-order mark) or GB18030, so those are tried when UTF-8 does not fit.
export async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}
