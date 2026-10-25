import type { FilmTimeline, Verdict } from '../src/shared/schemas.js';

export interface FilmReceipt { claim: string; verdict: Verdict; explanation: string; excerpt: string; domain: string }
export interface FilmStageData {
  timeline: FilmTimeline; images: Record<string, string>; videos: Record<string, string>;
  receipts: { en: FilmReceipt; fr: FilmReceipt; es: FilmReceipt }; vod: { quote: string; time: string; coverage: string[] };
  votes: { total: number; real: number; not_real: number }; capture: Record<string, number>;
  diff: string; buildOutput: string; site: string;
  measurement: { label: string; agreement: string; excerpts: string; wrongDirection: string } | null;
}
declare global { interface Window { film: { seek(time: number): Promise<void>; duration: number } } }

export async function stageRuntime(data: FilmStageData): Promise<void> {
  const target = document.getElementById('film-stage'); if (!(target instanceof HTMLCanvasElement)) throw new Error('Missing film stage.');
  const raw = target.getContext('2d'); if (!raw) throw new Error('Canvas unavailable.'); const ctx = raw;
  const ratio = target.width / 1920; ctx.scale(ratio, ratio);
  const palette = { ink: '#0e0e10', white: '#f5f3fa', purple: '#bf94ff', cyan: '#22d3ee', muted: '#b8b0c7', real: '#36e37f', not_real: '#fb7185', missing_context: '#ffd586', unconfirmed: '#aab6c8' };
  const images = new Map<string, { element: HTMLImageElement; box: [number, number, number, number] }>(), videos = new Map<string, HTMLVideoElement>();
  await Promise.all([document.fonts.load('700 130px Booth'), document.fonts.load('400 24px Inter')]); await document.fonts.ready;
  await Promise.all(Object.entries(data.images).map(async ([key, source]) => {
    const element = new Image(); element.src = source; await element.decode(); let box: [number, number, number, number] = [0, 0, element.width, element.height];
    if (key.startsWith('overlay') || key === 'twitch-proof') {
      const surface = document.createElement('canvas'); surface.width = element.width; surface.height = element.height; const brush = surface.getContext('2d');
      if (brush) { brush.drawImage(element, 0, 0); const pixels = brush.getImageData(0, 0, surface.width, surface.height).data;
        let left = surface.width, top = surface.height, right = 0, bottom = 0;
        for (let y = 0; y < surface.height; y += 2) for (let x = 0; x < surface.width; x += 2) if ((pixels[(y * surface.width + x) * 4 + 3] ?? 0) > 20) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
        if (right > left && bottom > top) box = [Math.max(0, left - 12), Math.max(0, top - 12), Math.min(surface.width - left, right - left + 24), Math.min(surface.height - top, bottom - top + 24)];
      }
    }
    images.set(key, { element, box });
  }));
  await Promise.all(Object.entries(data.videos).map(([key, source]) => new Promise<void>((resolve, reject) => {
    const element = document.createElement('video'); element.muted = true; element.preload = 'auto'; element.playsInline = true; element.src = source;
    element.onloadeddata = () => { videos.set(key, element); resolve(); }; element.onerror = () => reject(new Error(`Captured video unavailable: ${key}`)); element.load();
  })));
  const beat = 60 / data.timeline.bpm, bar = beat * data.timeline.beats_per_bar, duration = bar * data.timeline.total_bars;
  function ease(value: number) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 4); }
  function text(value: string, x: number, y: number, size: number, color = palette.white, heading = false, align: CanvasTextAlign = 'left') {
    ctx.font = `${heading ? '700' : '400'} ${size}px ${heading ? 'Booth' : 'Inter'}, 'Segoe UI Emoji', sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(value, x, y);
  }
  function wrap(value: string, x: number, y: number, width: number, size: number, line = 1.4, color = palette.white, heading = false) {
    ctx.font = `${heading ? '700' : '400'} ${size}px ${heading ? 'Booth' : 'Inter'}, 'Segoe UI Emoji', sans-serif`; let current = '', row = 0;
    for (const paragraph of value.split('\n')) { for (const word of paragraph.split(' ')) { const candidate = current ? `${current} ${word}` : word; if (current && ctx.measureText(candidate).width > width) { text(current, x, y + row++ * size * line, size, color, heading); current = word; } else current = candidate; } if (current) text(current, x, y + row++ * size * line, size, color, heading); current = ''; }
    return y + row * size * line;
  }
  function rule(x: number, y: number, width: number, color = '#ffffff30') { ctx.fillStyle = color; ctx.fillRect(x, y, width, 1); }
  function tag(value: string, x: number, y: number, color = palette.cyan) { text(value, x, y, 12, color); }
  function head(value: string, x = 80, y = 230, size = 130, color = palette.white) { return wrap(value, x, y, 650, size, .98, color, true); }
  function image(key: string, x: number, y: number, width: number, height: number, fill = false) {
    const item = images.get(key); if (!item) return; const [sx, sy, sw, sh] = item.box, scale = fill ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip(); ctx.drawImage(item.element, sx, sy, sw, sh, x + (width - sw * scale) / 2, y + (height - sh * scale) / 2, sw * scale, sh * scale); ctx.restore();
  }
  async function video(key: string, time: number, x: number, y: number, width: number, height: number) {
    const element = videos.get(key); if (!element) return;
    const seek = Math.min(Math.max(0, time), Math.max(0, element.duration - .06));
    if (Math.abs(element.currentTime - seek) > .01) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { element.removeEventListener('seeked', ready); reject(new Error('A captured frame did not seek.')); }, 5000);
      function ready() { clearTimeout(timer); resolve(); } element.addEventListener('seeked', ready, { once: true }); element.currentTime = seek;
    });
    const scale = Math.min(width / element.videoWidth, height / element.videoHeight); ctx.drawImage(element, x + (width - element.videoWidth * scale) / 2, y + (height - element.videoHeight * scale) / 2, element.videoWidth * scale, element.videoHeight * scale);
  }
  function frame(x: number, y: number, width: number, height: number) { ctx.strokeStyle = '#b48ee44d'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, height); ctx.fillStyle = palette.purple; ctx.fillRect(x, y, width, 3); }
  function receipt(value: FilmReceipt, x: number, y: number, width: number, small = false) {
    const pad = small ? 27 : 35; ctx.fillStyle = '#19171f'; ctx.fillRect(x, y, width, small ? 580 : 650); frame(x, y, width, small ? 580 : 650);
    tag('STORED SOURCE CHECK', x + pad, y + 25, palette.purple); let cursor = wrap(value.claim, x + pad, y + 70, width - pad * 2, small ? 31 : 35, 1.35);
    cursor += 22; text(value.verdict.replaceAll('_', ' ').toUpperCase(), x + pad, cursor, small ? 68 : 88, palette[value.verdict], true); cursor += small ? 94 : 116;
    if (!small) cursor = wrap(value.explanation, x + pad, cursor, width - pad * 2, 21, 1.5, '#d2cadc') + 22;
    rule(x + pad, cursor, width - pad * 2); tag(value.domain.toUpperCase(), x + pad, cursor + 19, palette.cyan);
    wrap(`“${value.excerpt}”`, x + pad, cursor + 53, width - pad * 2, small ? 23 : 28, 1.5);
  }
  async function render(time: number) {
    const t = Math.max(0, Math.min(duration - .001, time)), scene = data.timeline.scenes.find((item) => t >= item.start_bar * bar && t < item.end_bar * bar) ?? data.timeline.scenes[0]!;
    const local = t - scene.start_bar * bar, remaining = scene.end_bar * bar - t;
    ctx.globalAlpha = 1; ctx.fillStyle = palette.ink; ctx.fillRect(0, 0, 1920, 1080);
    const glow = ctx.createRadialGradient(1600, 150, 0, 1600, 150, 1250); glow.addColorStop(0, '#56267442'); glow.addColorStop(1, '#0e0e1000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1920, 1080);
    for (let index = 0; index < 9; index++) { ctx.strokeStyle = '#ffffff04'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1000 + index * 155 + Math.sin(t / 9) * 30, 0); ctx.lineTo(300 + index * 155 + Math.sin(t / 9) * 30, 1080); ctx.stroke(); }
    ctx.fillStyle = palette.cyan; ctx.fillRect(77, 45, 35, 41); text('?', 85, 44, 36, palette.ink, true); text('CHAT, IS THIS REAL?', 127, 50, 28, palette.white, true); text(scene.label, 1840, 59, 12, palette.muted, false, 'right');
    ctx.save(); ctx.globalAlpha = ease(local / .35) * ease(remaining / .23); ctx.translate((1 - ease(local / .55)) * 45, 0);
    if (scene.id === 'hook') {
      const word = local < beat * 6 ? ['CHAT.', 'IS THIS', 'REAL?'][Math.min(2, Math.floor(local / (beat * 2)))]! : 'RECEIPTS?';
      head(word, 85, 230, word === 'RECEIPTS?' ? 167 : 190, local < beat * 4 ? palette.white : palette.purple);
      const lines = [data.receipts.en.claim, 'wait fr?? 👀', 'source: trust me bro Kappa'];
      lines.forEach((line, index) => { const amount = ease((local - index * beat * 2) / .3); if (amount <= 0) return; ctx.save(); ctx.globalAlpha *= amount; ctx.translate((1 - amount) * 70, 0); tag(`demo_viewer_${index + 1}`, 920, 205 + index * 175, index === 1 ? palette.cyan : palette.purple); wrap(line, 920, 238 + index * 175, 820, index ? 34 : 35, 1.4); rule(920, 355 + index * 175, 820); ctx.restore(); });
      if (local >= bar * 2) { ctx.fillStyle = '#9146ff'; ctx.fillRect(1190, 765, 550, 115); text('!real ↵', 1225, 776, 82, palette.white, true); } tag('SCRIPTED CHAT · RECORDED MODEL RESULTS', 85, 875, palette.muted);
    } else if (scene.id === 'intro') {
      if (local < bar * 4) { head('CHECK.\nCALL.\nCLIP.', 80, 175, 134); await video('desk', data.capture['desk-start']! + Math.min(3.3, local * .6), 700, 180, 1135, 680); frame(700, 180, 1135, 680); tag('ACTUAL PRODUCT CAPTURE · RECORDED RESULTS', 700, 888); }
      else { head('ON\nTWITCH.', 80, 215, 160, palette.purple); image('twitch-proof', 760, 215, 1060, 600); tag('ACTUAL TWITCH EVENTSUB TEST · PRERECORDED STREAM', 760, 845); }
    } else if (scene.id === 'claim') {
      if (local < bar * 4) { head('A CLAIM\nLANDS.', 80, 235, 130); await video('desk', data.capture['evidence-end']! + Math.min(3.1, local * .5), 710, 190, 1130, 670); frame(710, 190, 1130, 670); }
      else if (local < bar * 13) { head('READ.\nTHE.\nSOURCE.', 80, 190, 122); receipt(data.receipts.en, 740, 160, 1095); tag('ON THE REVIEW DESK · CURATED SEARCH DISCOVERY', 740, 850, palette.muted); }
      else { head('YOUR\nCALL.', 80, 235, 155, palette.purple); await video('desk', data.capture['votes-cast']! + Math.min(1.2, (local - bar * 13) / 6), 710, 180, 1130, 690); frame(710, 180, 1130, 690); tag('STREAMER APPROVAL · THE VOTE WINDOW STILL APPLIES', 710, 895); }
    } else if (scene.id === 'votes') {
      const landing = bar * 10, sourceTime = data.capture['check-requested']! + (data.capture['vote-revealed']! - data.capture['check-requested']!) * Math.min(1, local / landing) + Math.max(0, local - landing);
      if (sourceTime < data.capture['vote-revealed']!) { head('1 = REAL\n2 = NOT REAL', 80, 260, 76); text('FIRST VOTE COUNTS.', 80, 485, 42, palette.purple, true); await video('desk', sourceTime, 690, 170, 1150, 710); frame(690, 170, 1150, 710); }
      else { head('CHAT\nCALLED IT.', 80, 235, 138, palette.purple); image('overlay-fact', 740, 215, 1095, 590); text(`${data.votes.real} REAL  /  ${data.votes.not_real} NOT REAL`, 740, 830, 28, palette.muted); }
      tag(`${data.votes.total} SCRIPTED DEMO VOTERS · RECORDED RESULTS`, 80, 900, palette.cyan);
    } else if (scene.id === 'vod') {
      if (local < bar * 4) { head('YOU SAID\nWHAT?', 80, 235, 135); text(data.vod.time, 80, 575, 74, palette.cyan, true); wrap(`“${data.vod.quote}”`, 765, 250, 1030, 38, 1.55); text("IT'S IN THE VOD", 765, 175, 65, palette.cyan, true); }
      else if (local < bar * 8) { text('ROLL THE ACTUAL MOMENT.', 80, 175, 88, palette.purple, true); await video('twitch', 3 + local - bar * 4, 360, 295, 1200, 675); frame(360, 295, 1200, 675); tag('ACTUAL TWITCH CLIP · ORIGINAL PRERECORDED TEST · SYSTEM NARRATION', 360, 265, palette.cyan); }
      else if (local < bar * 12) { head('QUOTE.\nTIME.\nCLIP.', 80, 180, 126); image('overlay-vod', 760, 225, 1060, 620); tag('QUOTE AND TIMECODE RESOLVED FROM STORED SEGMENTS', 760, 875); }
      else { head('NOT\nFOUND.', 80, 230, 148, palette.muted); text('IN THE INDEXED TRANSCRIPT.', 760, 220, 55, palette.cyan, true); data.vod.coverage.slice(0, 4).forEach((line, index) => { rule(760, 330 + index * 105, 1050); text(line, 760, 355 + index * 105, 25, palette.white); }); wrap('A miss applies to this coverage. It does not mean something was never said.', 760, 820, 990, 24, 1.5, palette.muted); }
    } else if (scene.id === 'languages') {
      text('CHAT SPEAKS. RECEIPTS ANSWER.', 80, 145, 76, palette.purple, true); tag('FRANÇAIS', 80, 255); tag('ESPAÑOL', 1000, 255); receipt(data.receipts.fr, 80, 300, 840, true); receipt(data.receipts.es, 1000, 300, 840, true);
    } else if (scene.id === 'control') {
      if (local < bar * 4) { head('KEEP\nTHE\nCONTEXT.', 80, 185, 128); image('history', 700, 170, 1140, 710); frame(700, 170, 1140, 710); }
      else { head('THE DESK.\nIN YOUR\nDOCK.', 80, 215, 120, palette.purple); image('dock', 980, 160, 455, 730, true); frame(980, 160, 455, 730); tag('ACTUAL 380 PX LAYOUT', 980, 915); }
    } else if (scene.id === 'codex') {
      if (local < bar * 4) { head('BUILT\nWITH\nCODEX.', 80, 185, 128); await video('codex', local, 690, 180, 1150, 690); frame(690, 180, 1150, 690); tag('ACTUAL CODEX CLI RECORDING · PROJECT INSTRUCTIONS', 690, 905); }
      else if (local < bar * 7) { text('SHORT TOKENS. REAL BUG.', 80, 155, 86, palette.purple, true); text('PC', 80, 320, 155, palette.white, true); text('+', 300, 365, 65, palette.muted, true); text('8', 410, 320, 155, palette.cyan, true); ctx.fillStyle = '#17161c'; ctx.fillRect(700, 285, 1140, 570); const lines = data.diff.split('\n').slice(-18); lines.forEach((line, index) => text(line.slice(0, 95), 725, 310 + index * 27, 17, line.startsWith('+') ? palette.real : line.startsWith('-') ? palette.not_real : palette.muted)); tag('ACTUAL RETRIEVAL DIFF · RECORDED SOURCE REGRESSION', 700, 890); }
      else { head('AUDIT.\nFIX.\nVERIFY.', 80, 205, 126, palette.purple); ctx.fillStyle = '#101215'; ctx.fillRect(700, 205, 1140, 660); data.buildOutput.split('\n').filter(Boolean).slice(-18).forEach((line, index) => text(line.slice(0, 100), 730, 235 + index * 31, 19, /pass|✓|✔/iu.test(line) ? palette.real : palette.muted)); tag('ACTUAL BUILD CHECK OUTPUT', 700, 905); }
    } else {
      if (local < bar * 4 && data.measurement) {
        text('THE RECEIPTS, MEASURED.', 80, 170, 102, palette.purple, true); tag(data.measurement.label, 80, 305, palette.muted);
        [['VERDICT AGREEMENT', data.measurement.agreement], ['RETURNED EXCERPTS VERIFIED', data.measurement.excerpts], ['WRONG-DIRECTION ERRORS', data.measurement.wrongDirection]].forEach(([label, value], index) => { text(value!, 80 + index * 605, 430, 145, index === 2 ? palette.white : palette.cyan, true); wrap(label!, 80 + index * 605, 620, 540, 22, 1.5, palette.muted); });
      } else { text('CHAT,', 960, 230, 185, palette.white, true, 'center'); text('IS THIS REAL?', 960, 400, 185, palette.purple, true, 'center'); text('SHOW THE RECEIPTS. CHECK THE VOD.', 960, 655, 42, palette.white, true, 'center'); text(data.site || 'PLAY THE DEMO · LINK ON THE PROJECT PAGE', 960, 765, 26, palette.cyan, false, 'center'); }
      text('An independent project built for Twitch · Built with OpenAI Codex', 960, 905, 15, palette.muted, false, 'center');
    }
    ctx.restore();
    const caption = data.timeline.captions.find((item) => t >= item.start_bar * bar && t < item.end_bar * bar)?.text ?? '';
    ctx.fillStyle = '#08080ae8'; ctx.fillRect(65, 970, 1790, 65); text(caption, 960, 987, 24, palette.white, false, 'center');
    rule(80, 1057, 1760, '#ffffff25'); ctx.fillStyle = palette.purple; ctx.fillRect(80, 1057, 1760 * t / duration, 3);
  }
  window.film = { seek: render, duration }; await render(0);
}

export function stageHTML(data: FilmStageData, fonts: { heading: string; body: string }, width: number, height: number): string {
  const payload = JSON.stringify(data).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Chat Is This Real | Launch film stage</title><style>@font-face{font-family:Booth;src:url(data:font/woff2;base64,${fonts.heading})}@font-face{font-family:Inter;src:url(data:font/woff2;base64,${fonts.body})}html,body{margin:0;background:#0e0e10;overflow:hidden}canvas{display:block;width:1920px;height:1080px}</style><canvas id="film-stage" width="${width}" height="${height}" aria-label="Chat Is This Real launch film"></canvas><script>const __name=(value)=>value;(${stageRuntime.toString()})(${payload}).catch(error=>{document.body.dataset.error=String(error);console.error(error)});</script></html>`;
}
