import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { ffmpegBinary } from '../../src/shared/ffmpeg.js';

const execute = promisify(execFile), escape = (value: string) => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/"/gu, '&quot;');
await execute(ffmpegBinary(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '43', '-i', '../footage/codex/M0-2026-10-24_0909.mkv', '-frames:v', '1', 'data/gallery/codex.png'], { windowsHide: true });
await execute(ffmpegBinary(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '6', '-i', 'data/probe/1792855780317/alignment-clip.mp4', '-frames:v', '1', 'data/gallery/stream.png'], { windowsHide: true });
const heading = (await readFile('node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2')).toString('base64');
const body = (await readFile('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2')).toString('base64');
const uri = async (path: string) => `data:${path.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${(await readFile(path)).toString('base64')}`;
const picture = async (path: string, css = '') => `<img src="${await uri(path)}" class="${css}" alt="Actual project capture">`;
const raw: unknown = JSON.parse(await readFile('eval/results/vod-live-1792855780317.json', 'utf8'));
if (!raw || typeof raw !== 'object' || !('moment_age_s' in raw) || typeof raw.moment_age_s !== 'number') throw new Error('Missing measured earlier-moment age.');
const minutes = (raw.moment_age_s / 60).toFixed(1);
const instructions = (await readFile('AGENTS.md', 'utf8')).split('\n').slice(0, 46).join('\n');
const sheets = [
  { name: '01-cover', caption: 'A streamer review desk for sourced chat checks, audience votes and earlier-moment clips.',
    html: `<div class="cover"><div><span class="wordmark">? / THE REPLAY BOOTH</span><h1>CHAT,<br>IS THIS<br><em>REAL?</em></h1><p>Sourced checks.<br>Stream memory.<br>Your stream. Your call.</p></div><div class="cover-screen">${await picture('data/gallery/desk.png')}${await picture('data/gallery/evidence-detail.png', 'receipt')}</div></div>` },
  { name: '02-earlier-moment', caption: `The real Twitch test found a promise made ${minutes} minutes earlier in the same broadcast.`,
    html: `<div class="problem"><div class="measurement"><strong>${minutes}</strong><span>MINUTES EARLIER</span><p>Same-broadcast Twitch test.<br>Original prerecorded system narration.</p></div>${await picture('data/gallery/vod-detail.png')}</div>` },
  { name: '03-overlay', caption: 'The recorded demo overlay, composited over the original test scene, reveals a reviewed verdict.',
    html: `<div class="stream-composite">${await picture('data/gallery/stream.png', 'stream')}${await picture('data/gallery/overlay.png', 'overlay')}</div>` },
  { name: '04-source-detail', caption: 'The actual review desk keeps the original claim, source links and verified excerpt together.', html: await picture('data/gallery/desk.png', 'screen') },
  { name: '05-vod', caption: 'The VOD result shows stored words, their stream time, transcript coverage and the confirmed clip.', html: await picture('data/gallery/vod.png', 'screen') },
  { name: '06-history', caption: 'Viewer History lets the streamer select several messages as context for a check.', html: await picture('data/gallery/history.png', 'screen') },
  { name: '07-evaluation', caption: 'Final dev and single heldout measurements, generated from the complete frozen-engine reports.', html: await picture('docs/figures/evaluation.svg', 'full') },
  { name: '08-architecture', caption: 'The model proposes, code verifies the result, and the streamer controls publication.', html: await picture('docs/architecture.svg', 'diagram') },
  { name: '09-twitch-reply', caption: 'An actual twitch.tv VOD reply contains the stored quote, timestamp and clip; account labels are hidden.',
    html: `<div class="twitch-proof">${await picture('data/gallery/stream.png', 'player')}${await picture('data/film/twitch-site/twitch-reply.png', 'reply')}</div>` },
  { name: '10-codex', caption: 'Actual Codex instruction-reading footage beside the project’s agent rules.',
    html: `<div class="codex-proof">${await picture('data/gallery/codex.png')}<pre>${escape(instructions)}</pre></div>` },
  { name: '11-french-spanish', caption: 'French and Spanish chat examples use recorded model results and the same verified-source review.',
    html: `<div class="languages">${await picture('data/gallery/fr.png')}${await picture('data/gallery/es.png')}</div>` },
  { name: '12-latency', caption: 'Final dev and heldout latency percentiles include every input and exclude paid search discovery.', html: await picture('docs/figures/latency.svg', 'diagram') }
];
if (sheets.some((sheet) => sheet.caption.length > 140)) throw new Error('A gallery caption exceeds 140 characters.');
const style = `@font-face{font-family:Booth;src:url(data:font/woff2;base64,${heading})}@font-face{font-family:Inter;src:url(data:font/woff2;base64,${body})}*{box-sizing:border-box}body{margin:0;background:#fff;width:1200px;height:800px;color:#172731;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden}img{display:block;object-fit:contain;max-width:100%;max-height:100%}.screen{width:1100px;max-height:700px;border:1px solid #dce6ec;border-radius:12px;box-shadow:0 20px 50px #20344415}.full{width:1200px;height:800px}.diagram{width:1180px;max-height:780px}.cover{width:1120px;height:700px;display:grid;grid-template-columns:370px 1fr;gap:35px;align-items:center}.wordmark{font-size:12px;letter-spacing:2px;color:#087f96}h1{font:700 142px/.86 Booth,sans-serif;letter-spacing:-2px;margin:35px 0}em{font-style:normal;color:#9146ff}.cover p{font-size:24px;line-height:1.6}.cover-screen{position:relative;min-width:0}.cover-screen>img:first-child{width:720px;max-width:none;transform:translateX(-10px);border-radius:10px;box-shadow:0 18px 45px #20344420}.cover-screen .receipt{width:365px;max-height:400px;position:absolute;right:0;bottom:-170px;border-radius:10px;box-shadow:0 14px 40px #20344438}.problem{width:1080px;display:grid;grid-template-columns:1fr 540px;gap:70px;align-items:center}.problem>img{max-height:680px;border-radius:10px;box-shadow:0 16px 45px #20344420}.measurement strong{display:block;font:700 250px/1 Booth,sans-serif;color:#9146ff}.measurement span{font-size:25px;letter-spacing:2px}.measurement p{font-size:15px;line-height:1.7;color:#526674;margin-top:35px}.stream-composite{width:1100px;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 16px 50px #20344420}.stream-composite .stream{width:1100px}.stream-composite .overlay{position:absolute;inset:0;width:1100px;height:100%}.twitch-proof{width:1100px;display:grid;grid-template-columns:680px 360px;gap:60px;align-items:center}.twitch-proof .player{border-radius:10px}.twitch-proof .reply{max-height:680px;width:360px;border:1px solid #dce6ec;box-shadow:0 18px 45px #20344412}.codex-proof{width:1100px;display:grid;grid-template-columns:650px 420px;gap:30px;align-items:center}.codex-proof>img{border-radius:8px;box-shadow:0 16px 50px #20344420}.codex-proof pre{font:10px/1.55 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f7fa;padding:24px;border-radius:12px;max-height:710px;overflow:hidden;margin:0}.languages{width:1080px;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start}.languages>img{max-height:700px;width:510px;border-radius:10px;box-shadow:0 18px 45px #20344420}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  for (const sheet of sheets) {
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${sheet.name}</title><style>${style}</style>${sheet.html}</html>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode())); });
    await page.screenshot({ path: `docs/gallery/${sheet.name}.png` }); console.info(`Gallery: ${sheet.name}.`);
  }
} finally { await browser.close(); }
await writeFile('CAPTIONS.md', `# Gallery captions\n\n${sheets.map((sheet) => `- **${sheet.name}.png**: ${sheet.caption}`).join('\n')}\n\nThe earlier dark multilingual study, \`chat-speaks-french-spanish.png\`, is a separate film asset.\n`);
await writeFile('docs/gallery/manifest.json', JSON.stringify({ width: 2400, height: 1600, source: 'Actual 2× browser captures, measured reports, original source diagrams and owned recordings.', twitch_adjustments: 'Owned account labels hidden. The actual reply’s long text is wrapped to the chat width for legibility.', sheets: sheets.map(({ name, caption }) => ({ file: `${name}.png`, caption, characters: caption.length })) }, null, 2));
console.info('Rendered twelve 2400×1600 gallery images and checked every caption.');
