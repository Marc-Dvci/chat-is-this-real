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
  const words = [...new Set(normalizeText(queries.join(' ')).match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
    .filter((word) => !['the', 'and', 'for', 'are', 'was', 'with', 'does', 'from', 'that', 'this', 'what', 'how'].includes(word));
  if (!words.length) return text.slice(0, size);
  const passageSize = Math.min(1400, size);
  const passages = Array.from({ length: Math.ceil(text.length / Math.max(1, Math.floor(passageSize / 2))) }, (_, index) => {
    const start = index * Math.max(1, Math.floor(passageSize / 2));
    const value = text.slice(start, start + passageSize);
    const tokens: string[] = normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
    return { start, value, tokens, score: 0 };
  });
  for (const word of words) {
    const frequency = passages.filter((passage) => passage.tokens.includes(word)).length;
    const weight = Math.log(1 + passages.length / (1 + frequency));
    for (const passage of passages) {
      const count = passage.tokens.filter((token) => token === word).length;
      passage.score += weight * count / (count + 1);
    }
  }
  const selected: typeof passages = [];
  let length = 0;
  for (const passage of passages.sort((left, right) => right.score - left.score || left.start - right.start)) {
    if (passage.score <= 0 || selected.some((other) => Math.abs(other.start - passage.start) < passageSize)) continue;
    const separatorLength = selected.length ? '\n[...]\n'.length : 0;
    const remaining = size - length - separatorLength;
    if (remaining <= 0) break;
    const value = passage.value.slice(0, remaining);
    selected.push({ ...passage, value });
    length += value.length + separatorLength;
    if (selected.length === 4) break;
  }
  return selected.length ? selected.sort((left, right) => left.start - right.start).map((passage) => passage.value).join('\n[...]\n') : text.slice(0, size);
}
