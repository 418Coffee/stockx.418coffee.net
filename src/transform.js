import { PDFDocument } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getFormat } from './formats/index.js';
import { MAX_BYTES } from './limits.js';
import { checkPdfSecurity } from './pdf-security.js';
export { MAX_BYTES } from './limits.js';

GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;

export async function transform(input, { formatId } = {}) {
  const format = getFormat(formatId);
  const bytes = new Uint8Array(input);
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Choose a PDF smaller than 10 MB.');
  if (!new TextDecoder().decode(bytes.subarray(0, 5)).startsWith('%PDF-')) throw new Error('This file is not a PDF.');
  let source;
  try { source = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw new Error('Cannot read this PDF. It may be damaged or password protected.'); }
  checkPdfSecurity(source);
  const task = getDocument({
    data: bytes.slice(), isEvalSupported: false, stopAtErrors: true,
    maxImageSize: 8_000_000, disableFontFace: true, useSystemFonts: false, useWasm: false,
  });
  try { await format.validate(source, await task.promise); }
  finally { await task.destroy(); }
  const out = await PDFDocument.create();
  const page = out.addPage(format.pageSize);
  for (const { page: n, box: [left,bottom,right,top], at: [x,y] } of format.regions) {
    const embedded = await out.embedPage(source.getPage(n), { left,bottom,right,top });
    page.drawPage(embedded, { x,y, width: right-left, height: top-bottom });
  }
  out.setTitle('StockX order and shipping label');
  out.setProducer('StockX label modifier');
  return out.save();
}
