// Keep both PDF parsers off the UI thread and terminate stalled conversions.
export function convertPdf(bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./convert-worker.js', import.meta.url), { type: 'module' });
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('PDF processing timed out. This file may be too complex or unsupported.')), 30000);
    worker.onmessage = ({ data }) => {
      if (data?.type !== 'converted') return;
      if (!data.error && !(data.bytes instanceof Uint8Array)) {
        finish(new Error('Could not process this PDF.'));
        return;
      }
      finish(data.error ? new Error(data.error) : null, data.bytes);
    };
    worker.onerror = event => {
      event.preventDefault();
      finish(new Error('Could not process this PDF. It may be damaged or too complex.'));
    };
    worker.postMessage({type:'convert',bytes}, [bytes.buffer]);
  });
}
