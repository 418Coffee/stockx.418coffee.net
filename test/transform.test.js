import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFRawStream, degrees, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { transform, MAX_BYTES } from '../src/transform.js';
import dpd from '../src/formats/dpd.js';
import { getFormat, formats } from '../src/formats/index.js';
const file = (await readdir('.')).find(n => n.endsWith('.pdf'));
if (!file) throw new Error('Tests require the original example PDF in the project root.');
const original = new Uint8Array(await readFile(file));
const rewrite = async change => { const doc = await PDFDocument.load(original); await change(doc); return doc.save(); };
const images = doc => doc.context.enumerateIndirectObjects().map(([,obj]) => obj).filter(obj => obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));

test('example becomes one A4 page; carrier and QR image streams are unchanged', async () => {
  const result = await PDFDocument.load(await transform(original));
  assert.equal(result.getPageCount(), 1);
  assert.deepEqual(result.getPage(0).getSize(), {width:595.28,height:841.89});
  const before = images(await PDFDocument.load(original));
  const after = images(result);
  for (const width of [1200,116]) {
    const a = before.find(i => i.dict.get(PDFName.of('Width')).asNumber() === width);
    const b = after.find(i => i.dict.get(PDFName.of('Width')).asNumber() === width);
    assert.ok(a && b);
    assert.deepEqual(b.contents,a.contents, `image ${width} preserved byte for byte`);
  }
  for (const {box:[l,b,r,t],at:[x,y]} of dpd.regions) {
    assert.ok(x >= 0 && y >= 0 && x+r-l <= 595.28 && y+t-b <=841.89);
  }
});
test('rejects non-PDF, empty, oversized and corrupt input', async () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(MAX_BYTES+1), new TextEncoder().encode('hello'), new TextEncoder().encode('%PDF-broken')]) await assert.rejects(transform(bytes), /PDF/);
});
test('rejects wrong page count', async () => {
  await assert.rejects(transform(await rewrite(d => d.removePage(1))), /Unsupported/);
});
test('rejects rotation, changed page dimensions and crop box', async () => {
  for (const change of [d=>d.getPage(0).setRotation(degrees(90)), d=>d.getPage(1).setSize(612,792), d=>d.getPage(0).setCropBox(10,10,575,821)]) await assert.rejects(transform(await rewrite(change)), /Unsupported/);
});
test('rejects unrelated two-page A4 PDFs', async () => {
  const d = await PDFDocument.create(); d.addPage([595.28,841.89]); d.addPage([595.28,841.89]);
  await assert.rejects(transform(await d.save()), /Unsupported/);
});
test('rejects shifted content instead of applying stale crops', async () => {
  await assert.rejects(transform(await rewrite(d=>d.getPage(0).translateContent(0,20))), /Unsupported/);
});
test('rejects product text that extends outside the table', async () => {
  await assert.rejects(transform(await rewrite(async d=> {
    const font = await d.embedFont(StandardFonts.Helvetica);
    d.getPage(0).drawText('Extra product line', {x:60,y:501,size:12,font});
  })), /product details/);
});
test('rejects carrier image repositioning', async () => {
  await assert.rejects(transform(await rewrite(d=>d.getPage(1).translateContent(15,0))), /Unsupported/);
});
test('rejects already processed files', async () => {
  await assert.rejects(transform(await transform(original)), /Unsupported/);
});

test('rejects mismatched order numbers', async () => {
  await assert.rejects(transform(await rewrite(d => {
    const page = d.getPage(1);
    const refs = page.node.Contents();
    const content = d.context.lookup(refs.get(0));
    const text = new TextDecoder().decode(decodePDFRawStream(content).decode());
    // Change the leading encoded digit of the second page order, retaining layout.
    const changed = text.replace('<001300170010', '<001400170010');
    assert.notEqual(changed,text);
    page.node.set(PDFName.of('Contents'), d.context.obj([d.context.register(d.context.flateStream(changed))]));
  })), /order numbers/);
});
test('rejects interactive annotations', async () => {
  await assert.rejects(transform(await rewrite(d => {
    d.getPage(0).node.set(PDFName.of('Annots'),d.context.obj([d.context.register(d.context.obj({
      Type:'Annot',Subtype:'Text',Rect:[60,600,80,620],Contents:'note'
    }))]));
  })), /Unsupported/);
});

test('format registry selects DPD explicitly and rejects unknown profiles', async () => {
  assert.equal(getFormat(),dpd);
  assert.equal(getFormat(dpd.id),dpd);
  assert.equal(formats.length,1);
  await assert.rejects(transform(original,{formatId:'ups'}), /Unsupported label format/);
  const pdf = await PDFDocument.load(await transform(original,{formatId:dpd.id}));
  assert.equal(pdf.getPageCount(),1);
});
