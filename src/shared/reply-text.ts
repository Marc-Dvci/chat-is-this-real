import { assertNoSecretFragments, formatChat } from './format-chat.js';
import type { Verdict } from './schemas.js';
import { loadedSecrets } from './secrets.js';

export function cleanModelExplanation(value: string, secrets: readonly string[] = []): string {
  assertNoSecretFragments(value, loadedSecrets(secrets));
  return value.normalize('NFKC')
    .replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:\/\S*)?/giu, '')
    .replace(/@[\p{L}\p{N}_-]+|![\p{L}\p{N}_]+|\/[a-z][a-z0-9_]*/giu, '')
    .replace(/[\r\n\t]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function buildCheckReply(verdict: Verdict, explanation: string, sourceUrl: string | undefined,
  resultId: string, resultBase: string, secrets: readonly string[] = []): string {
  const clean = cleanModelExplanation(explanation, secrets);
  if (!/^[a-zA-Z0-9_-]{8,80}$/u.test(resultId)) throw new Error('Invalid result identifier.');
  const base = new URL(resultBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Use a public HTTPS result address.');
  const details = `${base.href.replace(/\/$/u, '')}/r/${resultId}`;
  if (details.length > 200) throw new Error('The result address is too long.');
  if (verdict === 'unconfirmed') return formatChat(`UNCONFIRMED: no reliable source confirms or rules this out yet. Details: ${details}`, secrets);
  let domain: string | undefined;
  if (sourceUrl) {
    const source = new URL(sourceUrl);
    if (source.protocol !== 'https:' || source.username || source.password || source.hostname.length > 100) throw new Error('Invalid verified source address.');
    domain = source.hostname;
  }
  if ((verdict === 'real' || verdict === 'not_real') && !domain) throw new Error('A directional verdict needs a verified source.');
  const label = verdict === 'real' ? 'REAL' : verdict === 'not_real' ? 'NOT REAL' : 'MISSING CONTEXT';
  const tail = `${verdict === 'real' || verdict === 'not_real' ? ` Source: ${domain}.` : ''} Details: ${details}`;
  const fallback = verdict === 'real' ? 'the verified evidence supports this claim' : verdict === 'not_real'
    ? 'the verified evidence contradicts this claim' : 'essential qualifications change the answer';
  const body = (clean || fallback).slice(0, Math.min(180, 500 - label.length - tail.length - 4)).replace(/[.!?\s]+$/u, '');
  return formatChat(`${label}: ${body}.${tail}`, secrets);
}

export function clockText(offset: number): string {
  if (!Number.isFinite(offset) || offset < 0) throw new Error('Invalid stored offset.');
  const seconds = Math.floor(offset);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function buildVodReply(offset: number, storedQuote: string, clipUrl: string, secrets: readonly string[] = []): string {
  const url = new URL(clipUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !['clips.twitch.tv', 'www.twitch.tv'].includes(url.hostname)) throw new Error('Use a verified Twitch clip or VOD address.');
  if (url.hostname === 'www.twitch.tv' && !/^\/videos\/\d+$/u.test(url.pathname)) throw new Error('Use a verified VOD path.');
  const prefix = `IT'S IN THE VOD at ${clockText(offset)}: "`;
  const tail = `" Clip: ${url.href}`;
  const quote = storedQuote.slice(0, Math.max(0, Math.min(300, 500 - prefix.length - tail.length)));
  return formatChat(`${prefix}${quote}${tail}`, secrets);
}

export function buildNotFoundReply(start: number, end: number): string {
  const coverageClock = (offset: number) => offset < 3600 ? clockText(offset).replace(/^0:0?/u, '') : clockText(offset);
  return formatChat(`NOT FOUND in the indexed part of this stream (${coverageClock(start)} to ${coverageClock(end)}).`);
}
