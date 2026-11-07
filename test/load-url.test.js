import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUrl } from '../src/load-url.js';
import { MAX_BYTES } from '../src/transform.js';

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('loads a URL without sending cookies or a referrer', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://labels.stockx.com/label.pdf?token=abc');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.mode, 'cors');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return new Response(new Uint8Array([1,2,3]));
  }, async () => assert.deepEqual(await loadUrl('https://labels.stockx.com/label.pdf?token=abc'), new Uint8Array([1,2,3])));
});
test('rejects invalid schemes and embedded credentials before fetching', async () => {
  await withFetch(() => { throw new Error('must not fetch'); }, async () => {
    for (const url of ['bad', 'file:///tmp/label.pdf', 'data:application/pdf,test', 'https://user:pass@example.com/a.pdf', 'http://stockx.com/a.pdf', 'https://stockx.com:8443/a.pdf']) {
      await assert.rejects(loadUrl(url), /valid HTTP/);
    }
  });
});
test('reports HTTP and CORS/network errors', async () => {
  await withFetch(async () => new Response('', {status:403}), async () => assert.rejects(loadUrl('https://stockx.com/a'), /HTTP 403/));
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => assert.rejects(loadUrl('https://stockx.com/a'), /host may block browser access/));
});
test('rejects oversized responses by header and streamed bytes', async () => {
  await withFetch(async () => new Response('', {headers:{'content-length':String(MAX_BYTES+1)}}), async () => assert.rejects(loadUrl('https://stockx.com/a'), /10 MB/));
  let cancelled = false;
  await withFetch(async () => new Response(new ReadableStream({
    start(c) {c.enqueue(new Uint8Array(MAX_BYTES)); c.enqueue(new Uint8Array(1));},
    cancel() {cancelled = true;},
  })), async () => assert.rejects(loadUrl('https://stockx.com/a'), /10 MB/));
  assert.equal(cancelled,true);
});

test('allows the apex domain and DNS subdomains only', async () => {
  await withFetch(async () => new Response(new Uint8Array([1])), async () => {
    for (const url of ['https://stockx.com/a', 'https://labels.stockx.com/a', 'https://a.b.stockx.com/a', 'https://STOCKX.COM/a', 'https://stockx.com./a']) {
      assert.deepEqual(await loadUrl(url),new Uint8Array([1]));
    }
  });
});
test('rejects other domains and hostname lookalikes before any request', async () => {
  let requests = 0;
  await withFetch(async () => { requests++; return new Response(''); }, async () => {
    for (const url of ['https://example.com/a', 'https://stockx.com.evil.test/a', 'https://notstockx.com/a', 'https://stockx-com.test/a', 'https://evil.test/stockx.com/a', 'https://evil.test/?host=stockx.com', 'https://127.0.0.1/a', 'https://stοckx.com/a']) {
      await assert.rejects(loadUrl(url), /Only PDF URLs on stockx.com/);
    }
  });
  assert.equal(requests,0);
});
