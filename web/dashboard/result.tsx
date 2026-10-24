import { useEffect, useState } from 'react';
import { publicResultSchema, type PublicResult } from '../../src/shared/schemas.js';
import { errorMessage, readApi } from '../shared/api.js';
import { Badge, clock, Icon, shortDate, verdictLabel } from '../shared/ui.js';

export function ResultEvidence({ result }: { result: PublicResult }) {
  if (result.type === 'vod') return <>
    {result.found ? <><div className="vod-time"><Icon name="clock" size={24}/>{clock(result.offset_s ?? 0)}<Badge>{result.timing === 'word' ? 'Word aligned' : 'Approximate time'}</Badge></div><blockquote className="vod-quote">“{result.quote}”</blockquote>
      {result.clip?.clip_url && <a className="button primary" href={result.clip.clip_url} target="_blank" rel="noreferrer"><Icon name="play"/>Open Twitch clip<Icon name="external" size={14}/></a>}</>
      : <p className="muted">No matching moment was found in the indexed transcript.</p>}
    <h3 className="section-label">Indexed coverage</h3><div className="coverage-list">{result.coverage.map((item, index) => <div key={item.broadcast_id}><span>Stream {index + 1} · {clock(item.start_s)} to {clock(item.end_s)}</span><span className="muted">{item.segment_count} segments{item.gaps.length ? ` · ${item.gaps.length} gaps` : ''}</span></div>)}</div>
    <p className="fine-print">A negative result applies to this indexed coverage. It does not mean something was never said.</p>
  </>;
  return <><p className="explanation">{result.explanation}</p><h3 className="section-label">Verified evidence <span>{result.evidence.length}</span></h3>
    <div className="evidence-list">{result.evidence.map((item, index) => { const source = result.sources.find((entry) => entry.id === item.source_id); return <article key={`${item.source_id}-${index}`} className="evidence-row">
      <div className="evidence-heading"><Badge tone={item.stance}>{item.stance === 'supports' ? 'Supports' : item.stance === 'contradicts' ? 'Contradicts' : 'Context'}</Badge><span className="source-tier">Tier {source?.tier} · {source?.tier === 1 ? 'Official' : source?.tier === 2 ? 'Institutional' : source?.tier === 3 ? 'Press' : 'Other'}</span></div>
      <blockquote><mark>{item.excerpt}</mark></blockquote>{source && <><a className="source-link" href={source.url} target="_blank" rel="noreferrer">{source.title}<Icon name="external" size={14}/></a><div className="source-meta">{source.domain} · Captured {shortDate(source.fetched_at)}{source.origin === 'recorded_render' ? ' · Recorded excerpt' : ''}</div></>}
    </article>; })}{!result.evidence.length && <p className="muted">No excerpt established a reliable answer.</p>}</div>
  </>;
}
export function ResultPage({ id }: { id: string }) {
  const [result, setResult] = useState<PublicResult | null>(null), [error, setError] = useState('');
  useEffect(() => { const abort = new AbortController(); void readApi(`/api/results/${encodeURIComponent(id)}`, publicResultSchema, abort.signal).then(setResult).catch((caught: unknown) => { if (!abort.signal.aborted) setError(errorMessage(caught)); }); return () => abort.abort(); }, [id]);
  return <main className="public-page"><a href="/" className="wordmark">CHAT, IS THIS REAL?</a><div className="eyebrow">THE RECEIPTS</div>
    {error && <p role="alert">{error}</p>}{result ? <><h1>{result.claim}</h1><div className={`result-stamp ${result.type === 'vod' ? 'vod' : result.verdict}`}>{result.type === 'vod' ? result.found ? "IT'S IN THE VOD" : 'NOT FOUND' : verdictLabel(result.verdict)}</div><ResultEvidence result={result}/><footer className="public-footer">Checked {shortDate(result.checked_at)} · Sources and quotes are rendered from stored evidence.</footer></> : !error && <p role="status">Loading the stored result…</p>}
  </main>;
}
