import { MAX_BYTES } from './limits.js';
import { convertPdf } from './convert.js';
import { loadUrl } from './load-url.js';

const status = document.querySelector('#status');
const open = document.querySelector('#open');
const buttons = [...document.querySelectorAll('button')];
const urls = new Set();
let busy = false;

async function convert(load) {
  if (busy) return;
  busy = true;
  buttons.forEach(button => { button.disabled = true; });
  open.hidden = true;
  // Reserve the tab during the click, before async work consumes user activation.
  let tab;
  try {
    tab = window.open('about:blank', '_blank');
    if (tab) { tab.opener = null; tab.document.title = 'Converting PDF…'; }
    status.textContent = 'Converting…';
    const bytes = await convertPdf(await load());
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    urls.add(url);
    open.href = url;
    if (tab && !tab.closed) {
      tab.location.replace(url);
      status.textContent = '';
    } else {
      open.hidden = false;
      status.textContent = 'Your PDF is ready.';
    }
  } catch (error) {
    if (tab && !tab.closed) tab.close();
    status.textContent = error.message || 'Could not convert this PDF.';
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.querySelector('#file-form').addEventListener('submit', event => {
  event.preventDefault();
  void convert(async () => {
    const file = document.querySelector('#pdf').files[0];
    if (!file) throw new Error('Choose an original StockX PDF.');
    if (file.size > MAX_BYTES) throw new Error('Choose a PDF smaller than 10 MB.');
    return new Uint8Array(await file.arrayBuffer());
  });
});
document.querySelector('#url-form').addEventListener('submit', event => {
  event.preventDefault();
  void convert(() => loadUrl(document.querySelector('#pdf-url').value.trim()));
});
// Keep earlier results available while their tabs are still open.
window.addEventListener('pagehide', () => { for (const url of urls) URL.revokeObjectURL(url); });
