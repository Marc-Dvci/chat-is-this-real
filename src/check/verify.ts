import type { Evidence, SourceDocument } from '../shared/schemas.js';
import { normalizeText } from '../shared/text-normalize.js';

export function verifyEvidence(evidence: readonly Evidence[], sources: readonly SourceDocument[]) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const verified: Evidence[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    const source = byId.get(item.source_id);
    const normalized = normalizeText(item.excerpt);
    const words = normalized.split(' ').filter(Boolean).length;
    const identity = `${item.source_id}:${normalized}:${item.stance}`;
    if (source?.text && words >= 8 && words <= 40 && normalizeText(source.text).includes(normalized) && !seen.has(identity)) {
      verified.push(item);
      seen.add(identity);
    }
  }
  return { verified, dropped: evidence.length - verified.length };
}

export function sourceWindow(text: string, queries: readonly string[], size = 6000): string {
  if (text.length <= size) return text;
  const words = [...new Set(normalizeText(queries.join(' ')).match(/[\p{L}\p{N}]{4,}/gu) ?? [])];
  let bestOffset = 0, bestScore = -1;
  for (let offset = 0; offset < text.length; offset += 1500) {
    const window = normalizeText(text.slice(offset, offset + size));
    const score = words.reduce((sum, word) => sum + (window.includes(word) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestOffset = offset; }
  }
  return text.slice(bestOffset, bestOffset + size);
}
