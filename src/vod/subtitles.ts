export type SubtitleCue = { start: number; end: number; text: string };
function timestamp(value: string): number {
  const fields = value.replace(',', '.').split(':').map(Number);
  if (fields.length < 2 || fields.length > 3 || fields.some((field) => !Number.isFinite(field) || field < 0)) throw new Error('Invalid subtitle time.');
  const seconds = fields.at(-1) ?? 0, minutes = fields.at(-2) ?? 0, hours = fields.length === 3 ? fields[0] ?? 0 : 0;
  if (seconds >= 60 || minutes >= 60 || hours > 24) throw new Error('Invalid subtitle time.');
  return hours * 3600 + minutes * 60 + seconds;
}
function plain(value: string): string {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/<\/?[a-z][^>]*>/giu, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/giu, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (!lower.startsWith('#')) return entities[lower] ?? match;
    const code = Number.parseInt(lower.slice(lower.startsWith('#x') ? 2 : 1), lower.startsWith('#x') ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  }).replace(/\s+/gu, ' ').trim();
}
export function parseSubtitles(input: string, format: 'srt' | 'vtt' | 'txt'): SubtitleCue[] {
  const text = input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const cues: SubtitleCue[] = [];
  if (format === 'txt') {
    for (const line of text.split('\n').filter((line) => line.trim())) {
      const match = /^\s*\[?((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.+)$/u.exec(line);
      if (!match?.[1] || !match[2]) throw new Error('TXT lines need a timestamp followed by text.');
      cues.push({ start: timestamp(match[1]), end: 0, text: plain(match[2]) });
    }
    cues.forEach((cue, index) => { cue.end = Math.min(cues[index + 1]?.start ?? Infinity, cue.start + 15); });
  } else {
    for (const block of text.split(/\n\s*\n/u)) {
      const lines = block.trim().split('\n');
      if (!lines[0] || /^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/u.test(lines[0])) continue;
      const timing = lines.findIndex((line) => line.includes('-->'));
      if (timing < 0) throw new Error('A subtitle cue is missing its times.');
      const match = /^((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/u.exec(lines[timing] ?? '');
      if (!match?.[1] || !match[2]) throw new Error('Invalid subtitle cue times.');
      cues.push({ start: timestamp(match[1]), end: timestamp(match[2]), text: plain(lines.slice(timing + 1).join(' ')) });
    }
  }
  if (!cues.length || cues.length > 20_000 || cues.some((cue, index) => !cue.text || cue.text.length > 8000 || cue.end <= cue.start || cue.end > 86_400 || index > 0 && cue.start < (cues[index - 1]?.start ?? 0))) throw new Error('Check subtitle order, text and duration.');
  return cues;
}
