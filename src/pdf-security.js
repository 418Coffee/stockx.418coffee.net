import { PDFArray, PDFDict, PDFName, PDFStream } from 'pdf-lib';

// Composition preserves PDF resources; reject active content before copying them.
// This is deliberately conservative for shipping labels, not a general sanitizer.
const forbiddenKeys = new Set(['JS', 'JavaScript', 'AA', 'OpenAction', 'AcroForm', 'XFA', 'EmbeddedFiles', 'EF', 'AF', 'RichMediaContent', 'RichMediaSettings', 'Collection']);
const actionTypes = new Set(['JavaScript', 'Launch', 'URI', 'GoTo', 'GoToR', 'GoToE', 'SubmitForm', 'ResetForm', 'ImportData', 'Rendition', 'Movie', 'Sound', 'Hide', 'Named', 'SetOCGState', 'Trans', 'GoTo3DView', 'Thread']);
const unsafe = () => new Error('Unsupported PDF: active content, attachments or external resources are not allowed.');

export function checkPdfSecurity(doc) {
  const objects = doc.context.enumerateIndirectObjects();
  if (objects.length > 10000) throw new Error('Unsupported PDF: too many objects.');
  const seen = new Set();
  const pending = objects.map(([, object]) => object);
  while (pending.length) {
    const object = pending.pop();
    if (!object || seen.has(object)) continue;
    seen.add(object);
    if (seen.size > 100000) throw new Error('Unsupported PDF: too complex.');
    const dictionary = object instanceof PDFStream ? object.dict : object;
    if (dictionary instanceof PDFDict) {
      if (object instanceof PDFStream && dictionary.has(PDFName.of('F'))) throw unsafe();
      const type = dictionary.lookup(PDFName.of('Type'));
      const action = dictionary.lookup(PDFName.of('S'));
      if (type instanceof PDFName && ['Action','Filespec','EmbeddedFile'].includes(type.decodeText())) throw unsafe();
      if (action instanceof PDFName && actionTypes.has(action.decodeText())) throw unsafe();
      for (const [key, value] of dictionary.entries()) {
        if (forbiddenKeys.has(key.decodeText())) throw unsafe();
        pending.push(value);
      }
    } else if (object instanceof PDFArray) pending.push(...object.asArray());
  }
}
