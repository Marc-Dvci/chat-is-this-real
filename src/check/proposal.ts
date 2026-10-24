import type { JudgeProposal, SourceDocument } from '../shared/schemas.js';
import { verifyEvidence } from './verify.js';
import { decideVerdict } from './verdict-rules.js';

export function evaluateProposal(proposal: JudgeProposal, sources: readonly SourceDocument[]) {
  const evidence = verifyEvidence(proposal.evidence, sources);
  return { model_verdict: proposal.verdict, final_verdict: decideVerdict(proposal.verdict, evidence.verified),
    evidence: evidence.verified, returned_excerpts: proposal.evidence.length, dropped_excerpts: evidence.dropped };
}
