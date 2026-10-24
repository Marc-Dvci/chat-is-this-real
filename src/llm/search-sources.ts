import { sourceUrl } from '../check/source-network.js';

const excluded = ['facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'twitch.tv', 'x.com', 'twitter.com', 'reddit.com'];

export function selectSearchSources(candidates: readonly { url: string; title?: string | undefined }[]) {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    try {
      const url = sourceUrl(candidate.url);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (excluded.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)) || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ url: url.href, ...(candidate.title ? { title: candidate.title } : {}) }];
    } catch { return []; }
  }).slice(0, 6);
}
