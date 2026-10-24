import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { transcriptSegmentSchema, twitchClipsSchema, type VodProposal } from '../src/shared/schemas.js';
import { openDatabase } from '../src/store/database.js';
import { SegmentStore } from '../src/store/segment-store.js';
import { resolveVodAnswer } from '../src/vod/answer.js';
import { alignChunk, chunkOffset } from '../src/vod/align.js';
import { queryTerms } from '../src/vod/numbers.js';
import { canonicalClipUrl, clipWindow, vodTimestampUrl } from '../src/vod/clips.js';
import { parseSubtitles } from '../src/vod/subtitles.js';

async function transcript() { return (await readFile('eval/vod/transcript.jsonl', 'utf8')).trim().split('\n').map((line) => transcriptSegmentSchema.parse(JSON.parse(line))); }
it('applies wall time, measured correction and stored word times without inventing an offset', async () => {
  expect(chunkOffset('2026-10-24T08:26:23.500Z', '2026-10-24T08:25:23Z', -3.4)).toBeCloseTo(57.1);
  const segment = (await transcript())[0]; if (!segment) throw new Error('Missing recorded transcript.');
  const aligned = alignChunk(segment, -1);
  expect(aligned?.offset_s).toBe(0);
  expect(aligned?.words.every((word) => word.begin_time >= 0)).toBe(true);
  expect(alignChunk({ ...segment, words: [] }, -1)).toBeUndefined();
  expect(() => chunkOffset('invalid', 'invalid', 0)).toThrow();
});

it('renders the stored quote and word time, while rejecting foreign, fabricated and disjoint selections', async () => {
  const all = await transcript(), segment = all[1]; if (!segment) throw new Error('Missing recorded transcript.');
  const proposal: VodProposal = { found: true, segment_ids: [segment.id], relation: 'said', summary: '' };
  const answer = resolveVodAnswer(proposal, all, all, 'What was the promise about 50 pushups?');
  expect(answer?.quote).toBe(segment.text);
  expect(answer?.offset_s).toBeCloseTo(segment.offset_s + 0.16);
  expect(answer?.timing).toBe('word');
  expect(resolveVodAnswer({ ...proposal, segment_ids: ['fabricated'] }, all, all, '')).toBeUndefined();
  expect(resolveVodAnswer(proposal, [all[0]!], all, '')).toBeUndefined();
  expect(resolveVodAnswer({ ...proposal, segment_ids: [all[0]!.id, all[2]!.id] }, all, all, '')).toBeUndefined();
  expect(resolveVodAnswer({ ...proposal, segment_ids: [all[0]!.id, segment.id] }, all, all, '')).toBeUndefined();
});

it('expands number queries both ways and retrieves a real spoken-number segment through FTS5', async () => {
  expect(queryTerms('50 pushups for one hundred subscribers')).toEqual(expect.arrayContaining(['50', 'fifty', '100', 'hundred']));
  const all = await transcript(), source = all[1]; if (!source) throw new Error('Missing recorded transcript.');
  const db = openDatabase(':memory:');
  try {
    const store = new SegmentStore(db);
    store.register({ id: 'long-domain-stream', vod_id: null, title: 'Retrieval test', source: 'upload', started_at: source.created_at, created_at: source.created_at });
    for (let index = 0; index < 721; index++) store.put({ ...source, id: `copy-${index}`, broadcast_id: 'long-domain-stream', offset_s: index * 15 });
    const found = store.candidates('long-domain-stream', '50 pushups');
    expect(found.length).toBeGreaterThan(0); expect(found.length).toBeLessThanOrEqual(120);
    expect(found[0]?.text).toBe(source.text);
    store.remove('long-domain-stream'); expect(store.candidates('long-domain-stream', '50 pushups')).toEqual([]);
  } finally { db.close(); }
});

it('uses conservative stored clip bounds and validates the timestamp link', () => {
  expect(clipWindow(56.2, 70)).toEqual({ duration: 30, end: 78 });
  expect(vodTimestampUrl('2909296715', 56.2)).toBe('https://www.twitch.tv/videos/2909296715?t=0h0m56s');
  expect(() => vodTimestampUrl('foreign/path', 0)).toThrow();
});

it('builds the canonical clip link from the real response with an account-path URL and missing archive metadata', async () => {
  const fixture: { response: unknown } = JSON.parse(await readFile('fixtures/twitch/vod-clip.json', 'utf8'));
  const clip = twitchClipsSchema.parse(fixture.response).data[0]; if (!clip) throw new Error('Missing recorded clip.');
  expect(new URL(clip.url).hostname).toBe('www.twitch.tv');
  expect(canonicalClipUrl(clip.id)).toBe(`https://clips.twitch.tv/${clip.id}`);
  expect(clip.vod_offset).toBeNull();
  expect(() => canonicalClipUrl('../foreign')).toThrow();
});

it('parses caption formats and bounds inferred TXT coverage', () => {
  expect(parseSubtitles('WEBVTT\n\n00:01.000 --> 00:03.000\n<b>A cue.</b>', 'vtt')).toEqual([{ start: 1, end: 3, text: 'A cue.' }]);
  expect(parseSubtitles('[00:01] First cue.\n[01:00] Second cue.', 'txt')[0]).toEqual({ start: 1, end: 16, text: 'First cue.' });
  expect(() => parseSubtitles('Untimed text', 'txt')).toThrow();
  expect(() => parseSubtitles('1\n00:00:03,000 --> 00:00:01,000\nA cue.', 'srt')).toThrow();
});
