import type { TranscriptSegment, VodProposal } from '../shared/schemas.js';
import { normalizeText } from '../shared/text-normalize.js';
import { queryTerms } from './numbers.js';

function wordPositions(segment: TranscriptSegment) {
  let cursor = 0;
  return segment.words.flatMap((word) => {
    const text = word.text.trim(); if (!text) return [];
    const index = segment.text.indexOf(text, cursor); if (index < 0) return [];
    cursor = index + text.length;
    return [{ index, end: cursor, begin_s: word.begin_time / 1000, end_s: word.end_time / 1000 }];
  });
}

export function resolveVodAnswer(proposal: VodProposal, candidates: readonly TranscriptSegment[],
  all: readonly TranscriptSegment[], question: string) {
  if (!proposal.found || proposal.relation === 'not_found' || !proposal.segment_ids.length) return undefined;
  const permitted = new Map(candidates.map((segment) => [segment.id, segment]));
  const selected = proposal.segment_ids.flatMap((id) => { const segment = permitted.get(id); return segment ? [segment] : []; });
  if (selected.length !== proposal.segment_ids.length || new Set(proposal.segment_ids).size !== selected.length) return undefined;
  const first = selected[0]; if (!first) return undefined;
  const index = all.findIndex((segment) => segment.id === first.id);
  if (index < 0 || selected.some((segment, offset) => segment.broadcast_id !== first.broadcast_id || all[index + offset]?.id !== segment.id)) return undefined;
  if (selected.some((segment, offset) => offset > 0 && segment.offset_s > (selected[offset - 1]?.offset_s ?? 0) + (selected[offset - 1]?.duration_s ?? 0) + 2)) return undefined;
  let text = '';
  const spans = selected.map((segment) => {
    if (text) text += ' ';
    const start = text.length; text += segment.text;
    return { segment, start, end: text.length, words: wordPositions(segment) };
  });
  if (!text.trim()) return undefined;
  const terms = new Set(queryTerms(question));
  const anchors = [...text.matchAll(/[\p{L}\p{N}]+/gu)].filter((match) => terms.has(normalizeText(match[0])));
  let start = 0;
  if (text.length > 300 && anchors.length) {
    const best = anchors.map((match) => ({ start: Math.max(0, match.index - 90), score: 0 }));
    for (const candidate of best) candidate.score = anchors.filter((match) => match.index >= candidate.start && match.index < candidate.start + 300).length;
    start = best.sort((left, right) => right.score - left.score || left.start - right.start)[0]?.start ?? 0;
    if (start) { const boundary = text.indexOf(' ', start); if (boundary >= 0) start = boundary + 1; }
  }
  let end = Math.min(text.length, start + 300);
  if (end < text.length) { const boundary = text.lastIndexOf(' ', end); if (boundary > start) end = boundary; }
  const startSpan = spans.find((span) => start >= span.start && start < span.end);
  const endSpan = spans.findLast((span) => end > span.start);
  if (!startSpan || !endSpan) return undefined;
  const firstWord = startSpan.words.find((word) => word.index >= start - startSpan.start);
  const lastWord = endSpan.words.findLast((word) => word.end <= end - endSpan.start);
  if (firstWord && firstWord.index === start - startSpan.start) start = startSpan.start + firstWord.index;
  const precise = !!firstWord && firstWord.index === start - startSpan.start;
  return { quote: text.slice(start, end), offset_s: startSpan.segment.offset_s + (precise ? firstWord.begin_s : 0),
    end_s: endSpan.segment.offset_s + (lastWord?.end_s ?? endSpan.segment.duration_s), timing: precise ? 'word' as const : 'segment' as const,
    segment_ids: selected.map((segment) => segment.id), broadcast_id: first.broadcast_id, vod_id: first.vod_id, relation: proposal.relation };
}
