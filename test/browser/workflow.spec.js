import { test, expect } from '@playwright/test';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { PDFDocument } from 'pdf-lib';
import { securityHeaders } from '../../security-headers.js';
const file = (await readdir('.')).find(n=>n.endsWith('.pdf'));
const original = await readFile(file);
let server, remote, receivedCookie, receivedReferrer, tlsDirectory;
let outsideRequests = 0;

test.beforeAll(async () => {
  tlsDirectory=await mkdtemp(join(tmpdir(),'stockx-test-tls-'));
  const key=join(tlsDirectory,'key.pem'), cert=join(tlsDirectory,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=labels.stockx.com'],{stdio:'ignore'});
  server = createServer({key:await readFile(key),cert:await readFile(cert)},(req,res) => {
    if (req.headers.host.startsWith('outside.example:')) outsideRequests++;
    receivedCookie = req.headers.cookie;
    receivedReferrer = req.headers.referer;
    if (req.url !== '/blocked.pdf') res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/pdf');
    if (req.url === '/redirect.pdf') {
      res.writeHead(302,{Location:`http://outside.example:${server.address().port}/label.pdf`});res.end();
    }
    else if (req.url === '/missing.pdf') {res.writeHead(404);res.end();}
    else if (req.url === '/invalid.pdf') res.end('not a pdf');
    else res.end(original);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  remote = 'https://labels.stockx.com';
});
test.afterAll(async () => {
  if(server) await new Promise(resolve=>server.close(resolve));
  if(tlsDirectory) await rm(tlsDirectory,{recursive:true,force:true});
});
// Route to a real local TLS server so browser CORS is enforced; no live StockX traffic.
test.beforeEach(async ({context}) => {
  await context.route('https://labels.stockx.com/**',async route => {
    const url = new URL(route.request().url());
    await route.continue({url:`https://127.0.0.1:${server.address().port}${url.pathname}${url.search}`});
  });
});

async function expectPdfTab(page, click) {
  const opened = page.waitForEvent('popup');
  await click();
  const tab = await opened;
  await expect.poll(()=>tab.url(),{timeout:30000}).toMatch(/^blob:/);
  const data = await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),tab.url());
  const pdf = await PDFDocument.load(new Uint8Array(data));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({width:595.28,height:841.89});
  await expect(page.getByRole('button',{name:'Convert file',exact:true})).toBeEnabled();
  return tab;
}

test('file conversion opens an A4 PDF tab without external requests; invalid file recovers', async ({page})=> {
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173')) external.push(r.url());});
  await page.goto('/');
  await expect(page.getByRole('link',{name:'Source code'})).toHaveAttribute('href','https://github.com/418Coffee/stockx.418coffee.net');
  await expect(page.locator('footer')).toContainText('never uploaded');
  await page.getByLabel('PDF file',{exact:true}).setInputFiles(file);
  const tab = await expectPdfTab(page,()=>page.getByRole('button',{name:'Convert file',exact:true}).click());
  await tab.close();
  expect(errors).toEqual([]);expect(external).toEqual([]);
  await expect(page.locator('canvas,iframe')).toHaveCount(0);
  await page.screenshot({path:'artifacts/app.png',fullPage:true});
  await page.getByLabel('PDF file',{exact:true}).setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not pdf')});
  await page.getByRole('button',{name:'Convert file',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('not a PDF');
  await expect(page.getByRole('button',{name:'Convert file',exact:true})).toBeEnabled();
});

test('URL conversion works across origins without cookies or a referrer', async ({page,context})=> {
  await context.addCookies([{name:'test-session',value:'private',url:remote}]);
  await page.goto('/');
  await page.getByLabel('PDF URL',{exact:true}).fill(`${remote}/label.pdf?token=example`);
  const tab = await expectPdfTab(page,()=>page.getByRole('button',{name:'Convert URL',exact:true}).click());
  expect(receivedCookie).toBeUndefined();expect(receivedReferrer).toBeUndefined();
  await tab.close();
});

test('URL failures show useful errors and close the empty tab',async({page})=>{
  await page.goto('/');
  for (const [path,message] of [['blocked.pdf','host may block browser access'],['missing.pdf','HTTP 404'],['invalid.pdf','not a PDF']]) {
    await page.getByLabel('PDF URL',{exact:true}).fill(`${remote}/${path}`);
    const opened=page.waitForEvent('popup');
    await page.getByRole('button',{name:'Convert URL',exact:true}).click();
    const tab=await opened;
    await expect(page.getByRole('status')).toContainText(message);
    await expect.poll(()=>tab.isClosed()).toBe(true);
    await expect(page.getByRole('button',{name:'Convert URL',exact:true})).toBeEnabled();
  }
});

test('blocked popups leave a link to the generated PDF',async({page})=>{
  await page.addInitScript(()=>{window.open=()=>null;});
  await page.goto('/');
  await page.getByLabel('PDF file',{exact:true}).setInputFiles(file);
  await page.getByRole('button',{name:'Convert file',exact:true}).click();
  await expect(page.getByRole('link',{name:'Open modified PDF'})).toHaveAttribute('href',/^blob:/,{timeout:30000});
});

test('works at mobile width',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Convert URL',exact:true})).toBeVisible();
});

test('rejects external URL domains before fetching',async({page})=>{
  await page.goto('/');
  const requested=[];
  page.on('request',r=>{if(/^https?:/.test(r.url())) requested.push(r.url());});
  await page.getByLabel('PDF URL',{exact:true}).fill('https://stockx.com.evil.test/label.pdf');
  await page.getByRole('button',{name:'Convert URL',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Only PDF URLs on stockx.com');
  expect(requested).toEqual([]);
});
test('does not follow a StockX URL redirect to another domain',async({page})=>{
  outsideRequests=0;
  await page.goto('/');
  await page.getByLabel('PDF URL',{exact:true}).fill(`${remote}/redirect.pdf`);
  const opened=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Convert URL',exact:true}).click();
  const tab=await opened;
  await expect(page.getByRole('status')).toContainText('Redirects are not allowed');
  await expect.poll(()=>tab.isClosed()).toBe(true);
  expect(outsideRequests).toBe(0);
});

test('security headers are enforced and inline scripts are blocked',async({page})=>{
  const response=await page.goto('/');
  for (const [name,value] of Object.entries(securityHeaders)) expect(response.headers()[name.toLowerCase()]).toBe(value);
  await page.evaluate(()=>{
    const script=document.createElement('script');
    script.textContent='window.inlineScriptExecuted=true';
    document.head.append(script);
  });
  expect(await page.evaluate(()=>window.inlineScriptExecuted)).toBeUndefined();
});
test('HTTP label URLs are rejected before fetching',async({page})=>{
  await page.goto('/');
  const requests=[];
  page.on('request',r=>{if(/^https?:/.test(r.url())) requests.push(r.url());});
  await page.getByLabel('PDF URL',{exact:true}).fill('http://stockx.com/label.pdf');
  await page.getByRole('button',{name:'Convert URL',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('valid HTTPS PDF URL');
  expect(requests).toEqual([]);
});
test('stalled conversion is terminated and the UI recovers',async({page})=>{
  await page.addInitScript(()=>{
    const RealWorker=window.Worker;
    window.Worker=class extends RealWorker {
      postMessage(...args) {
        if(this.__stall) return;
        return super.postMessage(...args);
      }
      constructor(...args) {super(...args);this.__stall=true;}
      terminate() {window.workerTerminated=true;return super.terminate();}
    };
  });
  await page.goto('/');
  await page.clock.install();
  await page.getByLabel('PDF file',{exact:true}).setInputFiles(file);
  await page.getByRole('button',{name:'Convert file',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Converting');
  await page.clock.runFor(31000);
  await expect(page.getByRole('status')).toContainText('timed out');
  await expect(page.getByRole('button',{name:'Convert file',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>window.workerTerminated)).toBe(true);
});
