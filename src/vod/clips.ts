import { setTimeout as delay } from 'node:timers/promises';
import { formatChat } from '../shared/format-chat.js';
import { twitchClipCreatedSchema, twitchVideosSchema, type ClipResult, type VodOutcome } from '../shared/schemas.js';
import { TwitchHelix } from '../twitch/helix.js';

export function vodTimestampUrl(vodId: string, offset: number): string {
  if (!/^\d+$/u.test(vodId) || !Number.isFinite(offset) || offset < 0) throw new Error('Invalid stored VOD reference.');
  const seconds = Math.floor(offset);
  return `https://www.twitch.tv/videos/${vodId}?t=${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s`;
}
export function clipWindow(start: number, finish: number): { duration: number; end: number } {
  if (!Number.isFinite(start) || !Number.isFinite(finish) || start < 0 || finish < start) throw new Error('Invalid stored quote interval.');
  const duration = Math.min(60, Math.max(30, Math.ceil(finish - start + 16)));
  return { duration, end: Math.max(duration, Math.ceil(finish + 8)) };
}
export function canonicalClipUrl(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(id)) throw new Error('Invalid Twitch clip identifier.');
  return `https://clips.twitch.tv/${id}`;
}

export async function createVodClip(helix: TwitchHelix, outcome: VodOutcome, options: {
  signal?: AbortSignal; onUpdate?: (value: ClipResult) => void
} = {}): Promise<ClipResult> {
  if (!outcome.found || outcome.failed || !outcome.vod_id || outcome.offset_s === null || outcome.end_s === null) throw new Error('A verified stored VOD moment is required.');
  const signal = options.signal ?? AbortSignal.timeout(75_000), client = new TwitchHelix(helix.tokens, signal);
  const broadcaster = await client.tokens.get('broadcaster');
  const videos = await client.request('app', 'GET', `/videos?${new URLSearchParams({ id: outcome.vod_id })}`, twitchVideosSchema);
  const video = videos.data.find((item) => item.id === outcome.vod_id && item.user_id === broadcaster.user_id && item.type === 'archive');
  if (!video || !broadcaster.user_id) throw new Error('Choose a VOD belonging to the connected broadcaster.');
  const fallback = vodTimestampUrl(video.id, outcome.offset_s);
  const base: ClipResult = { state: 'pending', clip_id: null, clip_url: null, vod_url: fallback, reason: null };
  options.onUpdate?.(base);
  const window = clipWindow(outcome.offset_s, outcome.end_s);
  if (window.end - window.duration > outcome.offset_s) {
    const value: ClipResult = { ...base, state: 'fallback', reason: 'quote_exceeds_clip_window' }; options.onUpdate?.(value); return value;
  }
  let clipId: string, createdFromVod = true;
  try {
    const query = new URLSearchParams({ editor_id: broadcaster.user_id, broadcaster_id: broadcaster.user_id, vod_id: video.id,
      vod_offset: String(window.end), duration: String(window.duration), title: formatChat(`Stream memory: ${outcome.quote}`, helix.tokens.loadedSecrets()).slice(0, 100) });
    const created = await client.request('broadcaster', 'POST', `/videos/clips?${query}`, twitchClipCreatedSchema);
    clipId = created.data[0]?.id ?? '';
  } catch (error) {
    if (signal.aborted) throw error;
    const stream = await client.currentStream();
    const age = stream ? (Date.now() - Date.parse(stream.started_at)) / 1000 - outcome.end_s : Infinity;
    if (!stream || stream.id !== outcome.broadcast_id || age < 0 || age >= 20) {
      const value: ClipResult = { ...base, state: 'fallback', reason: 'vod_clip_unavailable' }; options.onUpdate?.(value); return value;
    }
    await client.requireStream(stream.id);
    try {
      createdFromVod = false;
      const created = await client.request('broadcaster', 'POST', `/clips?${new URLSearchParams({ broadcaster_id: stream.user_id,
        title: 'Recent stream memory' })}`, twitchClipCreatedSchema);
      clipId = created.data[0]?.id ?? '';
    } catch {
      const value: ClipResult = { ...base, state: 'fallback', reason: 'clip_unavailable' }; options.onUpdate?.(value); return value;
    }
  }
  const started = Date.now(); let fallbackShown = false;
  const pollSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]), polling = new TwitchHelix(helix.tokens, pollSignal);
  while (Date.now() - started <= 60_000) {
    signal.throwIfAborted();
    if (pollSignal.aborted) break;
    let clip: Awaited<ReturnType<TwitchHelix['clip']>>;
    try {
      clip = await polling.clip(clipId);
    } catch (error) { if (signal.aborted) throw error; }
      // Live archives can omit these fields until the stream ends. The VOD creation request still binds its exact window.
      const clipStart = clip?.vod_offset ?? (createdFromVod ? window.end - window.duration : undefined);
      if (clip && clip.broadcaster_id === broadcaster.user_id && (clip.video_id === video.id || createdFromVod && !clip.video_id) && clipStart !== undefined &&
        clipStart <= outcome.offset_s + 1 && clipStart + clip.duration >= outcome.end_s - 1) {
        const ready: ClipResult = { ...base, state: 'ready', clip_id: clip.id, clip_url: canonicalClipUrl(clip.id) };
        options.onUpdate?.(ready); return ready;
      }
    if (!fallbackShown && Date.now() - started >= 20_000) {
      fallbackShown = true; options.onUpdate?.({ ...base, state: 'fallback', clip_id: clipId, reason: 'clip_processing' });
    }
    try { await delay(2000, undefined, { signal: pollSignal }); }
    catch (error) { if (signal.aborted) throw error; break; }
  }
  const value: ClipResult = { ...base, state: 'fallback', clip_id: clipId, reason: 'clip_timeout' };
  options.onUpdate?.(value); return value;
}
