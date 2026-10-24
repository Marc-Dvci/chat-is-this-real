import { createHash } from 'node:crypto';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { SourceDocument } from '../shared/schemas.js';
import { downloadSource, sourceUrl } from './source-network.js';

export function sourceTier(host: string): 1 | 2 | 3 | 4 {
  const domain = host.replace(/^www\./, '').toLowerCase();
  if (['nasa.gov', 'esa.int', 'python.org', 'developer.mozilla.org', 'nomanssky.com', 'minecraft.net', 'godotengine.org', 'twitch.tv', 'nodejs.org', 'alibabacloud.com'].some((official) => domain === official || domain.endsWith(`.${official}`))) return 1;
  if (domain.endsWith('.edu') || domain.endsWith('.ac.uk') || domain === 'wikipedia.org' || domain.endsWith('.wikipedia.org')) return 2;
  if (['reuters.com', 'apnews.com', 'bbc.com', 'theverge.com', 'arstechnica.com'].some((press) => domain === press || domain.endsWith(`.${press}`))) return 3;
  return 4;
}

export async function fetchSource(value: string, id: string, signal?: AbortSignal): Promise<SourceDocument> {
  const url = sourceUrl(value);
  const domain = url.hostname.toLowerCase();
  const base = { id, url: url.href, title: domain, domain, tier: sourceTier(domain), fetched_at: new Date().toISOString() };
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
