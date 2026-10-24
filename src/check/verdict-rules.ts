import { verdictSchema, type Evidence, type Verdict } from '../shared/schemas.js';

export function decideVerdict(modelVerdict: unknown, evidence: readonly Evidence[]): Verdict {
  const proposed = verdictSchema.safeParse(modelVerdict);
  const supports = evidence.filter((item) => item.stance === 'supports').length;
  const contradicts = evidence.filter((item) => item.stance === 'contradicts').length;
  const context = evidence.filter((item) => item.stance === 'context').length;
  const allowed: Verdict[] = [];
  if (supports && !contradicts) allowed.push('real');
  if (contradicts && !supports) allowed.push('not_real');
  if ((supports && contradicts) || (proposed.data === 'missing_context' && supports + context > 0)) allowed.push('missing_context');
  if (!allowed.length) return 'unconfirmed';
  if (proposed.success && allowed.includes(proposed.data)) return proposed.data;
  return allowed.includes('missing_context') ? 'missing_context' : allowed[0] ?? 'unconfirmed';
}
