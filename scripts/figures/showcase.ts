import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { demoCatalogSchema } from '../../src/shared/schemas.js';
import { openDatabase } from '../../src/store/database.js';
import { seedDemo } from '../../src/demo/seed.js';
import { CheckStore } from '../../src/store/check-store.js';
import { PublicResults } from '../../src/server/public-result.js';
import { excerptPreview } from '../../src/shared/excerpt-preview.js';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const catalog = demoCatalogSchema.parse(JSON.parse(await readFile('fixtures/demo/showcase.json', 'utf8'))), db = openDatabase(':memory:');
const browser = await chromium.launch({ headless: true });
try {
  seedDemo(db, catalog); const checks = new CheckStore(db), results = new PublicResults(db);
  const receipts = ['showcase-fr', 'showcase-es'].map((key) => { const job = checks.get(`demo-check-${key}`); if (!job) throw new Error('Missing recorded example.'); return results.project(job); });
  const heading = (await readFile('node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2')).toString('base64');
  const body = (await readFile('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2')).toString('base64');
  const panels = receipts.map((receipt, index) => {
    if (receipt.type !== 'fact' || !receipt.evidence[0]) throw new Error('A gallery receipt needs verified evidence.');
    const evidence = receipt.evidence[0], source = receipt.sources.find((item) => item.id === evidence.source_id); if (!source) throw new Error('Missing stored source.');
    const label = ({ real: 'REAL', not_real: 'NOT REAL', missing_context: 'MISSING CONTEXT', unconfirmed: 'UNCONFIRMED' })[receipt.verdict];
    const words = receipt.claim.split(' '), tail = words.splice(-2).join(' ');
    const message = `${escape(words.join(' '))} <span class="keep">${escape(tail)}</span>`;
    return `<article lang="${index ? 'es' : 'fr'}"><div class="rail"><b>0${index + 1}</b><span>${index ? 'ESPAÑOL' : 'FRANÇAIS'}</span><i>STREAM CHAT</i></div><div class="author"><span class="badge">CHAT</span>demo_viewer_${index + 1}<span class="command">!real ↵</span></div><h2>${message}</h2><div class="decision ${receipt.verdict}">${label}<span>RECEIPTS CHECKED ↗</span></div><div class="evidence"><div class="source-label">${receipt.verdict === 'real' ? 'SUPPORTS' : 'CONTRADICTS'} · ${escape(source.domain)}</div><blockquote>“${escape(excerptPreview(evidence.excerpt))}”</blockquote><p>${escape(source.title)}</p></div></article>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Chat speaks. Receipts answer.</title><style>
  @font-face{font-family:Booth;src:url(data:font/woff2;base64,${heading})}@font-face{font-family:Inter;src:url(data:font/woff2;base64,${body})}
  *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;background:#0e0e10;color:#f5f5f8;font-family:Inter,sans-serif;padding:58px 76px;overflow:hidden;background-image:radial-gradient(ellipse at 90% -30%,#9146ff39,transparent 60%)}
  header{display:flex;justify-content:space-between;align-items:center;font-size:17px;letter-spacing:2.2px;font-weight:bold}.brand{display:flex;gap:14px;align-items:center;font:700 30px/1 Booth,sans-serif;letter-spacing:.3px}.symbol{background:#22d3ee;color:#0e0e10;width:39px;height:44px;display:grid;place-items:center;clip-path:polygon(0 0,100% 0,100% 75%,75% 100%,0 100%);font-size:35px}.label{font-size:13px;color:#b2a1ce;letter-spacing:2px}
  .title{display:flex;justify-content:space-between;align-items:end;margin:40px 0 38px}h1{font:700 100px/.92 Booth,sans-serif;letter-spacing:-1px;margin:0}h1 span{color:#bf94ff}.title p{font-size:22px;line-height:1.5;color:#c4c1cb;margin:0 0 3px;max-width:430px}main{display:grid;grid-template-columns:1fr 1fr;gap:64px}article{border-top:2px solid #9b6ae8;min-width:0}.rail{display:flex;align-items:center;gap:14px;height:56px;font-size:13px;letter-spacing:2px;color:#b9abc9}.rail b{color:#b891f5}.rail i{font-style:normal;margin-left:auto;font-size:11px;color:#9995a6}.author{display:flex;gap:12px;align-items:center;font-size:17px;color:#bf94ff;margin:16px 0}.badge{background:#9146ff;color:white;font-size:9px;letter-spacing:1px;padding:4px 5px}.command{margin-left:auto;font-family:monospace;color:#22d3ee;font-size:17px}h2{font-size:36px;line-height:1.4;letter-spacing:-.5px;font-weight:400;margin:0;height:158px;display:block;padding-top:4px}.decision{display:flex;align-items:center;gap:30px;font:700 60px/1 Booth,sans-serif;padding:10px 0 18px;border-bottom:1px solid #ffffff26}.decision span{font:400 10px/1 Inter,sans-serif;color:#b1acbb;letter-spacing:1.5px;margin-left:auto}.real{color:#36e37f}.not_real{color:#fb7185}.keep{white-space:nowrap}.evidence{padding-top:22px}.source-label{font-size:11px;letter-spacing:1.2px;color:#a9b9c8;text-transform:uppercase}blockquote{margin:16px 0 0;border-left:3px solid #22d3ee;padding-left:18px;font-size:23px;line-height:1.5;letter-spacing:-.2px}.evidence p{font-size:12px;color:#b3a6c9;margin:16px 0 0 21px}footer{position:absolute;bottom:42px;left:76px;right:76px;padding-top:20px;border-top:1px solid #ffffff26;display:flex;justify-content:space-between;font-size:12px;color:#b2aeba;line-height:1.5}footer strong{color:#22d3ee;font-weight:400;letter-spacing:1.5px;font-size:11px}
  </style><header><div class="brand"><span class="symbol">?</span>CHAT, IS THIS REAL?</div><span class="label">YOUR STREAM. YOUR CALL.</span></header><section class="title"><h1>CHAT SPEAKS.<br><span>RECEIPTS ANSWER.</span></h1><p>A claim in French. A claim in Spanish.<br>The source text stays verbatim.</p></section><main>${panels}</main><footer><span>Newly authored chat · Real model runs · Curated search discovery<br>Stored excerpts verified against fetched source text. These examples are separate from the evaluation set.</span><strong>THE REPLAY BOOTH / MULTILINGUAL SHOWCASE</strong></footer></html>`;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent(html); await page.evaluate(() => document.fonts.ready);
  await mkdir('docs/gallery', { recursive: true }); await page.screenshot({ path: 'docs/gallery/chat-speaks-french-spanish.png' });
  await writeFile('docs/gallery/chat-speaks-french-spanish.html', html);
  await writeFile('docs/gallery/receipts.json', JSON.stringify(receipts, null, 2));
  console.info('Rendered the French and Spanish gallery figure from verified showcase outcomes.');
} finally { await browser.close(); db.close(); }
