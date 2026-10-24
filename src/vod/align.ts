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
  const text = clipped ? words.map((word) => `${word.text}${word.punctuation ?? ''}`).join('').replace(/\s+/gu, ' ').trim() : input.text;
  return { ...input, text, words, offset_s: Math.max(0, rawOffset), duration_s: input.duration_s - clipped };
}
