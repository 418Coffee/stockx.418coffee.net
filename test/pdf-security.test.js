import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { readFile, readdir } from 'node:fs/promises';
import { transform } from '../src/transform.js';
import { checkPdfSecurity } from '../src/pdf-security.js';
import { securityHeaders } from '../security-headers.js';

const file=(await readdir('.')).find(n=>n.endsWith('.pdf'));
const original=await readFile(file);
const rewrite=async change=>{const doc=await PDFDocument.load(original);await change(doc);return doc.save();};

test('rejects document JavaScript and open actions',async()=>{
  await assert.rejects(transform(await rewrite(doc=>doc.addJavaScript('audit','app.alert("test")'))),/active content/);
  await assert.rejects(transform(await rewrite(doc=>doc.catalog.set(PDFName.of('OpenAction'),doc.context.obj({S:'JavaScript',JS:PDFString.of('app.alert("test")')})))),/active content/);
});
test('rejects attachments and external resource streams',async()=>{
  await assert.rejects(transform(await rewrite(async doc=>doc.attach(new Uint8Array([1,2,3]),'test.bin'))),/active content/);
  await assert.rejects(transform(await rewrite(doc=>{
    const stream=doc.context.stream(new Uint8Array(),{F:PDFString.of('https://outside.example/payload')});
    doc.getPage(0).node.Resources().set(PDFName.of('Unused'),doc.context.register(stream));
  })),/external resources/);
});
test('rejects actions hidden in otherwise unused resource dictionaries',async()=>{
  await assert.rejects(transform(await rewrite(doc=>{
    doc.getPage(0).node.Resources().set(PDFName.of('Unused'),doc.context.obj({S:'JavaScript',JS:PDFString.of('app.alert("test")')}));
  })),/active content/);
});
test('rejects excessive PDF object counts before inspection',async()=>{
  const doc=await PDFDocument.create();
  for(let i=0;i<10001;i++)doc.context.register(doc.context.obj({}));
  assert.throws(()=>checkPdfSecurity(doc),/too many objects/);
});
test('output contains no active content',async()=>{
  const doc=await PDFDocument.load(await transform(original));
  assert.doesNotThrow(()=>checkPdfSecurity(doc));
  assert.equal(doc.catalog.has(PDFName.of('OpenAction')),false);
  assert.equal(doc.catalog.has(PDFName.of('AcroForm')),false);
});
test('Nginx and Cloudflare policies match the verified preview headers',async()=>{
  const nginx=await readFile('deploy/nginx.conf','utf8');
  for(const [name,value] of Object.entries(securityHeaders)) {
    assert.ok(nginx.includes(`add_header ${name} "${value}" always;`),`${name} present in Nginx`);
  }
  assert.ok(securityHeaders['Content-Security-Policy'].includes("frame-ancestors 'none'"));
  assert.ok(!securityHeaders['Content-Security-Policy'].includes('unsafe-eval'));
});
