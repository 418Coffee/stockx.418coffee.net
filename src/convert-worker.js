import { transform } from './transform.js';

self.onmessage = async ({ data }) => {
  if (data?.type !== 'convert') return;
  try {
    const bytes = await transform(data.bytes);
    self.postMessage({ type: 'converted', bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ type: 'converted', error: error.message || 'Could not convert this PDF.' });
  }
};
