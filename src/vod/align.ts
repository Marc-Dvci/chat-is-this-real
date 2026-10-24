import type { TranscriptSegment } from '../shared/schemas.js';

export function chunkOffset(wallStart: string, streamStart: string, correction: number): number {
  const offset = (Date.parse(wallStart) - Date.parse(streamStart)) / 1000 + correction;
  if (!Number.isFinite(offset) || !Number.isFinite(correction)) throw new Error('Invalid stream alignment.');
  return offset;
}
export function alignChunk(input: Omit<TranscriptSegment, 'offset_s'>, rawOffset: number): TranscriptSegment | undefined {
  if (!Number.isFinite(rawOffset)) throw new Error('Invalid stream alignment.');
  const clipped = Math.max(0, -rawOffset);
  if (clipped >= input.duration_s) return undefined;
  if (clipped && input.text && !input.words.length) return undefined;
  const words = input.words.filter((word) => word.begin_time >= clipped * 1000)
    .map((word) => ({ ...word, begin_time: word.begin_time - clipped * 1000, end_time: word.end_time - clipped * 1000 }));
  let text = input.text;
  if (clipped && text) {
    const first = input.words.find((word) => word.begin_time >= clipped * 1000 && word.text.trim());
    if (!first) text = '';
    else {
      let cursor = 0, start = -1;
      for (const word of input.words) {
        if (!word.text.trim()) continue;
        const position = text.indexOf(word.text.trim(), cursor);
        if (position < 0) return undefined;
        if (word === first) { start = position; break; }
        cursor = position + word.text.trim().length;
      }
      if (start < 0) return undefined;
      text = text.slice(start);
    }
  }
  return { ...input, text, words, offset_s: Math.max(0, rawOffset), duration_s: input.duration_s - clipped };
}
