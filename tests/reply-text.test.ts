import { expect, it } from 'vitest';
import { buildCheckReply, buildNotFoundReply, buildVodReply } from '../src/shared/reply-text.js';
import { canonicalClipUrl, clipEmbedUrl, vodTimestampUrl } from '../src/shared/vod-links.js';

it('removes model URLs, mentions and command text while keeping the code-owned link intact', () => {
  const reply = buildCheckReply('real', 'Visit https://untrusted.invalid/x @demo_viewer !vod /ban. The document supports this.',
    'https://science.nasa.gov/moon/facts/', 'result_12345', 'https://receipts.example');
  expect(reply).not.toContain('untrusted');
  expect(reply).not.toContain('@demo_viewer');
  expect(reply).not.toContain('!vod');
  expect(reply).not.toContain('/ban');
  expect(reply).toContain('Source: science.nasa.gov. Details: https://receipts.example/r/result_12345');
  expect(reply.length).toBeLessThanOrEqual(500);
});

it('blocks a secret before sanitizing or shortening the explanation', () => {
  const secret = 'unused-test-credential-value';
  const explanation = `https://example.invalid/${secret} @demo_viewer !vod`;
  expect(() => buildCheckReply('real', explanation, 'https://science.nasa.gov/moon/facts/', 'result_12345', 'https://receipts.example', [secret])).toThrow('secret fragment');
});

it('preserves complete result links when explanations are long', () => {
  const reply = buildCheckReply('not_real', 'A'.repeat(1000), 'https://science.nasa.gov/moon/facts/', 'result_12345', 'https://receipts.example');
  expect(reply.length).toBeLessThanOrEqual(500);
  expect(reply.endsWith('https://receipts.example/r/result_12345')).toBe(true);
});

it('renders stored VOD times, bounded quotes and explicit coverage', () => {
  expect(buildVodReply(2530, 'Blue robot. '.repeat(100), 'https://clips.twitch.tv/recorded-clip').length).toBeLessThanOrEqual(500);
  expect(buildNotFoundReply(0, 4350)).toBe('NOT FOUND in the indexed part of this stream (0:00 to 1:12:30).');
});
it('builds Twitch player and VOD links only from stored identifiers and a valid parent', () => {
  expect(vodTimestampUrl('2909296715', 3662.8)).toBe('https://www.twitch.tv/videos/2909296715?t=1h1m2s');
  expect(canonicalClipUrl('Recorded-clip_123')).toBe('https://clips.twitch.tv/Recorded-clip_123');
  expect(clipEmbedUrl('Recorded-clip_123', 'receipts.example')).toBe('https://clips.twitch.tv/embed?clip=Recorded-clip_123&parent=receipts.example&autoplay=false');
  expect(() => clipEmbedUrl('clip&parent=elsewhere', 'receipts.example')).toThrow();
  expect(() => clipEmbedUrl('clip', 'receipts.example/path')).toThrow();
  expect(() => vodTimestampUrl('not-a-vod', 1)).toThrow();
  expect(() => vodTimestampUrl('123', -1)).toThrow();
});
