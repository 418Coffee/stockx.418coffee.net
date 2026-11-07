import { MAX_BYTES } from './limits.js';

export async function loadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid HTTPS PDF URL.'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) {
    throw new Error('Enter a valid HTTPS PDF URL on port 443 without embedded credentials.');
  }
  // Compare parsed DNS labels, not URL text: stockx.com.evil.test is not StockX.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  url.hostname = hostname;
  if (hostname !== 'stockx.com' && !hostname.endsWith('.stockx.com')) {
    throw new Error('Only PDF URLs on stockx.com or its subdomains are allowed.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let reader;
  try {
    const response = await fetch(url.href, {
      mode: 'cors', cache: 'no-store', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The PDF host returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      throw new Error('Choose a PDF smaller than 10 MB.');
    }
    if (!response.body) throw new Error('The PDF host returned an empty response.');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new Error('Choose a PDF smaller than 10 MB.');
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Fetching the PDF timed out. Try again or choose the file.');
    if (error instanceof TypeError) throw new Error('Cannot fetch this URL. The host may block browser access, require a login, or redirect. Redirects are not allowed. Choose the PDF file instead.');
    throw error;
  } finally {
    clearTimeout(timeout);
    // Abort also stops an oversized response before its body has been consumed.
    controller.abort();
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
