import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { sourceTiersSchema, type SourceDocument } from '../shared/schemas.js';
import { downloadSource, sourceUrl } from './source-network.js';

const sourceTiers = sourceTiersSchema.parse(JSON.parse(readFileSync(new URL('../../config/source-tiers.json', import.meta.url), 'utf8')));
export function sourceTier(host: string): 1 | 2 | 3 | 4 {
  const domain = host.replace(/^www\./, '').toLowerCase();
  const matches = (patterns: readonly string[]) => patterns.some((pattern) => domain === pattern || domain.endsWith(`.${pattern}`));
  if (matches(sourceTiers.institutional_domains)) return 2;
  if (matches(sourceTiers.official_domains)) return 1;
  if (sourceTiers.institutional_suffixes.some((suffix) => domain.endsWith(suffix))) return 2;
  if (matches(sourceTiers.press_domains)) return 3;
  return 4;
}

export async function fetchSource(value: string, id: string, signal?: AbortSignal): Promise<SourceDocument> {
  const url = sourceUrl(value);
  const domain = url.hostname.toLowerCase();
  const base = { id, url: url.href, title: domain, domain, tier: sourceTier(domain), fetched_at: new Date().toISOString(), origin: 'live_fetch' as const };
  try {
    const downloaded = await downloadSource(url.href, signal);
    let text = downloaded.body;
    let title = domain;
    if (downloaded.contentType.toLowerCase().includes('html') && text) {
      const { document } = parseHTML(text);
      document.querySelectorAll('script,style,noscript,template').forEach((node) => node.remove());
      for (const block of document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,div,section,article,tr,td,th,dt,dd,br')) {
        block.before(' '); block.after(' ');
      }
      const mainText = document.querySelector('main')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      const captions = [...document.querySelectorAll('figcaption,img[alt]')]
        .map((node) => (node.tagName === 'IMG' ? node.getAttribute('alt') : node.textContent)?.replace(/\s+/gu, ' ').trim() ?? '')
        .filter((caption) => caption.length >= 40 && caption.length <= 1000);
      try {
        const article = new Readability(document as unknown as Document).parse();
        text = article?.textContent ?? document.body?.textContent ?? '';
        title = article?.title ?? document.title ?? domain;
      } catch { text = document.body?.textContent ?? ''; title = document.title || domain; }
      // Some official release archives lose their version lists during article extraction.
      if (mainText.length > Math.max(500, text.length * 3)) text = mainText;
      for (const caption of new Set(captions)) if (!text.includes(caption)) text += `\n${caption}`;
    }
    text = Buffer.from(text.replace(/\s+/gu, ' ').trim()).subarray(0, 200_000).toString('utf8').replace(/\uFFFD$/u, '');
    const finalDomain = new URL(downloaded.url).hostname;
    return { ...base, url: downloaded.url, domain: finalDomain, tier: sourceTier(finalDomain), title: title.slice(0, 300),
      status: downloaded.status, text, sha256: createHash('sha256').update(text).digest('hex'),
      ...(!text ? { error: 'source_unavailable' } : {}) };
  } catch {
    return { ...base, status: 0, text: '', sha256: createHash('sha256').update('').digest('hex'), error: signal?.aborted ? 'aborted' : 'source_unavailable' };
  }
}
