export function vodTimestampUrl(vodId: string, offset: number): string {
  if (!/^\d+$/u.test(vodId) || !Number.isFinite(offset) || offset < 0) throw new Error('Invalid stored VOD reference.');
  const seconds = Math.floor(offset);
  return `https://www.twitch.tv/videos/${vodId}?t=${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s`;
}

export function canonicalClipUrl(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(id)) throw new Error('Invalid Twitch clip identifier.');
  return `https://clips.twitch.tv/${id}`;
}

export function clipEmbedUrl(id: string, parent: string): string {
  canonicalClipUrl(id);
  if (!/^[a-zA-Z0-9.-]+$/u.test(parent) || parent.startsWith('.') || parent.endsWith('.')) throw new Error('Invalid player parent.');
  return `https://clips.twitch.tv/embed?${new URLSearchParams({ clip: id, parent, autoplay: 'false' })}`;
}
