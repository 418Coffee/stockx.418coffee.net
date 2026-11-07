import dpd from './dpd.js';

// Explicit profiles today. A future detector can select one after inspecting a PDF;
// it must still run that profile's full validation before any crops are applied.
export const formats = Object.freeze([dpd]);

export function getFormat(id = dpd.id) {
  const format = formats.find(candidate => candidate.id === id);
  if (!format) throw new Error('Unsupported label format.');
  return format;
}
