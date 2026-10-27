import { writeFile } from 'node:fs/promises';

const escape = (value: string) => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
const nodes = [
  { x: 80, y: 230, w: 340, h: 150, title: 'Twitch chat', lines: ['EventSub WebSocket', 'Replies · votes · deletions'], color: '#9146ff' },
  { x: 500, y: 230, w: 360, h: 150, title: 'Local queue', lines: ['Roles · cooldowns · context', 'SQLite · cancellation · outbox'], color: '#087f96' },
  { x: 500, y: 570, w: 360, h: 150, title: 'Stream memory', lines: ['Host audio → Qwen ASR', 'Stored segments · FTS search'], color: '#087f96' },
  { x: 960, y: 150, w: 460, h: 150, title: 'Claim check', lines: ['Find sources · fetch pages', 'Qwen proposes a structured answer'], color: '#087f96' },
  { x: 960, y: 370, w: 460, h: 150, title: 'Code decides', lines: ['Verify literal excerpts and URLs', 'Deterministic verdict rules'], color: '#087f96' },
  { x: 960, y: 600, w: 460, h: 150, title: 'VOD answer', lines: ['Resolve stored segment IDs', 'Code owns quotes and timestamps'], color: '#087f96' },
  { x: 1520, y: 320, w: 360, h: 180, title: 'Streamer review', lines: ['Private desk / OBS dock', 'Approve · reveal · publish', 'Clip requires confirmation'], color: '#9146ff' },
  { x: 1980, y: 180, w: 340, h: 150, title: 'Chat + OBS', lines: ['Formatted threaded replies', 'Overlay · votes · scores'], color: '#9146ff' },
  { x: 1980, y: 540, w: 340, h: 150, title: 'Public receipts', lines: ['Signed Cloudflare Worker', 'Expiring KV · revocation'], color: '#9146ff' }
];
const links = ['M420 305 H500', 'M680 380 V570', 'M860 305 H905 V225 H960', 'M1190 300 V370', 'M860 645 H960',
  'M1420 445 H1520', 'M1420 675 H1465 V455 H1520', 'M1880 375 H1925 V255 H1980', 'M1880 445 H1925 V615 H1980'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="900" viewBox="0 0 2400 900" role="img" aria-labelledby="name description">
<title id="name">Chat Is This Real architecture</title><desc id="description">Twitch events enter a private local queue. Qwen proposals pass deterministic verification before streamer approval and publication. Stored speech segments supply VOD quotes and times.</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#748391"/></marker></defs>
<rect width="2400" height="900" rx="28" fill="white"/>
<rect x="465" y="100" width="1445" height="720" rx="32" fill="#f4f8fa" stroke="#dce6ec" stroke-dasharray="9 10"/>
<text x="500" y="70" font-family="Arial,sans-serif" font-size="22" fill="#526674">PRIVATE LOCAL APP</text>
${links.map((path) => `<path d="${path}" fill="none" stroke="#748391" stroke-width="3" marker-end="url(#arrow)"/>`).join('')}
${nodes.map((node) => `<g><rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="18" fill="white" stroke="#d7e1e8" stroke-width="2"/><rect x="${node.x}" y="${node.y + 22}" width="5" height="${node.h - 44}" rx="2" fill="${node.color}"/><text x="${node.x + 26}" y="${node.y + 45}" font-family="Arial,sans-serif" font-size="29" font-weight="700" fill="#172731">${escape(node.title)}</text>${node.lines.map((line, index) => `<text x="${node.x + 26}" y="${node.y + 82 + index * 29}" font-family="Arial,sans-serif" font-size="21" fill="#526674">${escape(line)}</text>`).join('')}</g>`).join('')}
</svg>`;
await writeFile('docs/architecture.svg', svg);
console.info('Regenerated the architecture diagram from the shipped components.');
