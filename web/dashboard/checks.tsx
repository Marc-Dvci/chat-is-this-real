import { useEffect, useRef, useState } from 'react';
import type { CheckView, DeskSnapshot, PublicResult } from '../../src/shared/schemas.js';
import { Badge, Button, Icon, shortTime, verdictLabel } from '../shared/ui.js';
import { ResultEvidence } from './result.js';
import { Votes } from './votes.js';
import { pagePath } from '../shared/paths.js';

export function privateResultView(job: CheckView): PublicResult | null {
  const value = job.outcome; if (!value || !job.input || value.failed) return null;
  if (value.type === 'vod') return { id: job.id, type: 'vod', claim: job.input.claim, found: value.found, quote: value.quote,
    offset_s: value.offset_s, end_s: value.end_s, relation: value.relation, timing: value.timing, clip: value.clip, vod_id: value.vod_id,
    broadcast_started_at: value.broadcast_started_at, coverage: value.coverage, checked_at: value.created_at };
  if (value.type !== 'fact' || value.final_verdict === 'not_a_claim') return null;
  return { id: job.id, type: 'fact', claim: job.input.claim, verdict: value.final_verdict, explanation: value.explanation,
    evidence: value.evidence, sources: value.sources, checked_at: value.created_at, retrieval_mode: value.retrieval_mode };
}
export function stateLabel(job: CheckView, active: string | null): string {
  if (job.state === 'on_air') return active === job.id ? 'On air' : 'Shown';
  if (['queued', 'triage', 'searching', 'reading', 'judging'].includes(job.state)) return 'Checking';
  return ({ ready: 'Ready', dismissed: 'Dismissed', failed: 'Failed', not_a_claim: 'Not a claim' } as Record<string, string>)[job.state] ?? job.state;
}
export function ChecksPanel({ data, selected, onSelect, onNew, onShow, onPost, onCopy, onClip, onDismiss, onViewer }: {
  data: DeskSnapshot; selected: string | null; onSelect: (id: string) => void; onNew: () => void;
  onShow: (job: CheckView) => void; onPost: (job: CheckView) => void; onCopy: (job: CheckView) => void;
  onClip: (job: CheckView) => void;
  onDismiss: (job: CheckView) => void; onViewer: (id: string) => void
}) {
  const [filter, setFilter] = useState('all'), [preview, setPreview] = useState(false);
  const active = data.overlay.presentation.phase === 'hidden' ? null : data.overlay.presentation.job_id;
  const rows = data.checks.filter((job) => filter === 'all' || filter === 'ready' && job.state === 'ready' || filter === 'shown' && job.state === 'on_air');
  const job = data.checks.find((item) => item.id === selected) ?? data.checks[0];
  const result = job ? privateResultView(job) : null;
  const request = data.requests.find((item) => item.id === job?.request_id), author = data.messages.find((item) => item.user_id === request?.author_user_id);
  const usable = job && ['ready', 'on_air'].includes(job.state) && result;
  const publicLink = data.public_pages.links.find((link) => link.job_id === job?.id && link.status === 'ready');
  return <section className="checks-panel" aria-label="Checks"><header className="panel-heading"><div><span className="eyebrow">THE REPLAY BOOTH</span><h2>Review desk <span className="count">{data.checks.length}</span></h2></div><Button icon="plus" onClick={onNew}>New check</Button></header>
    <div className="filter-tabs" aria-label="Check filters">{[['all', 'All checks'], ['ready', 'Ready'], ['shown', 'Shown']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value ?? 'all')}>{label}</button>)}</div>
    <ul className="check-queue">{rows.map((item) => { const itemRequest = data.requests.find((entry) => entry.id === item.request_id), user = data.messages.find((entry) => entry.user_id === itemRequest?.author_user_id); return <li key={item.id} className={job?.id === item.id ? 'selected' : ''}>
      <button className="check-select" aria-pressed={job?.id === item.id} onClick={() => onSelect(item.id)}><span className={`queue-glyph ${item.kind === 'vod' ? 'vod' : ''}`}><Icon name={item.kind === 'vod' ? 'clock' : 'check'}/></span><span className="queue-title">{item.input?.claim ?? 'Source removed'}</span><Badge tone={item.state}>{stateLabel(item, active)}</Badge></button>
      <div className="queue-meta">{user && <button className="user-name" onClick={() => onViewer(user.user_id)}>{user.display_name}</button>}<time>{shortTime(item.created_at)}</time></div>
    </li>; })}</ul>
    {!rows.length && <p className="muted queue-empty">No checks in this view.</p>}
    {job ? <article className="check-detail" data-check-id={job.id} data-state={job.state}><header className="detail-heading"><span className="eyebrow">{job.kind === 'vod' ? 'STREAM MEMORY' : 'SOURCE CHECK'}</span><Badge tone={job.state}>{stateLabel(job, active)}</Badge></header>
      {author && <button className="user-name detail-author" onClick={() => onViewer(author.user_id)}>{author.display_name} <Icon name="users" size={13}/></button>}
      <h3 className="claim-title">{job.input?.claim ?? 'This source was removed.'}</h3>
      {result ? <><div className={`result-stamp ${result.type === 'vod' ? 'vod' : result.verdict}`}>{result.type === 'vod' ? result.found ? "IT'S IN THE VOD" : 'NOT FOUND' : verdictLabel(result.verdict)}</div>
        {job.outcome?.type === 'fact' && job.outcome.sensitive && <p className="review-note"><Icon name="shield"/>Sensitive claim. A second confirmation is required.</p>}
        <ResultEvidence result={result}/></> : <div className="processing-state" role="status"><Icon name={job.state === 'failed' ? 'shield' : 'search'} size={28}/><h4>{job.state === 'dismissed' ? 'Check dismissed' : job.state === 'failed' ? 'This check needs attention' : job.state === 'not_a_claim' ? 'No factual claim to check' : 'Checking the evidence'}</h4><p>{job.state === 'dismissed' ? 'This check is kept off stream.' : job.reason === 'demo_unrecorded' ? 'This demo has no recorded result for that text. Try a recorded example.' : job.reason === 'source_removed' ? 'The source text was removed. This check cannot be published.' : job.reason === 'quota' ? 'The local allowance or provider quota was reached.' : job.reason ? job.reason.replaceAll('_', ' ') : 'The result stays private until you choose to show it.'}</p></div>}
      {job.outcome && job.outcome.type !== 'vod' && <details className="check-diagnostics"><summary>Check details</summary><dl><dt>Normalized claim</dt><dd>{job.outcome.normalized_claim}</dd><dt>Model proposal</dt><dd>{job.outcome.model_verdict ? verdictLabel(job.outcome.model_verdict) : 'No proposal'}</dd><dt>Final decision</dt><dd>{verdictLabel(job.outcome.final_verdict)}</dd><dt>Rejected excerpts</dt><dd>{job.outcome.dropped_excerpts} of {job.outcome.returned_excerpts}</dd></dl></details>}
      <div className="detail-actions"><Button icon="play" tone="primary" disabled={!usable} onClick={() => onShow(job)}>Show on stream</Button><Button icon="chat" disabled={!usable || !data.demo && result?.type === 'fact' && !data.public_pages.configured} onClick={() => onPost(job)}>Post to chat</Button><Button icon="copy" disabled={!usable || !data.demo && !data.public_pages.configured} onClick={() => onCopy(job)}>{data.demo || publicLink ? 'Copy link' : 'Publish link'}</Button><Button icon="close" disabled={job.state === 'dismissed'} onClick={() => onDismiss(job)}>Dismiss</Button></div>
      {result?.type === 'vod' && result.found && result.vod_id && <div className="clip-actions"><Button icon="play" disabled={!usable || result.clip?.state === 'pending' || !result.clip?.clip_url && (data.demo || !data.twitch.connected || Boolean(result.clip))} onClick={() => onClip(job)}>{result.clip?.clip_url ? 'Clip details' : result.clip?.state === 'pending' ? 'Twitch is processing the clip' : result.clip ? 'VOD link available' : 'Create Twitch clip'}</Button></div>}
      {publicLink && <a className="published-link" href={publicLink.url} target="_blank" rel="noreferrer">Public receipt <Icon name="external" size={13}/></a>}
      {!data.demo && !data.public_pages.configured && <p className="fine-print">Connect public receipts in Settings to share fact checks in chat.</p>}
      <div className="preview-toggle"><button className="text-button" aria-expanded={preview} onClick={() => setPreview(!preview)}><Icon name="play" size={15}/>{preview ? 'Close overlay preview' : 'Preview overlay'}</button><a href={pagePath('/overlay')} target="_blank" rel="noreferrer" aria-label="Open overlay in a new tab"><Icon name="external" size={16}/></a></div>{preview && <OverlayPreview/>}
    </article> : <div className="empty-state"><Icon name="check" size={36}/><h3>Your next check starts here</h3><p>Select a chat message or enter a claim to review.</p><Button tone="primary" onClick={onNew}>Create a check</Button></div>}<Votes data={data}/>
  </section>;
}
function OverlayPreview() {
  const element = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => { if (!element.current) return; const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0)); observer.observe(element.current); return () => observer.disconnect(); }, []);
  return <div className="overlay-preview" ref={element} style={{ height: width * 9 / 16 }}><iframe title="Overlay preview" src={pagePath('/overlay')} width="1920" height="1080" style={{ transform: `scale(${width / 1920})` }}/></div>;
}
