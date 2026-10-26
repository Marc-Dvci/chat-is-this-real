import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import { overlayViewSchema, type OverlayView } from '../../src/shared/schemas.js';
import { clock, verdictLabel } from '../shared/ui.js';
import '../shared/styles.css';
import './overlay.css';
import { subscribeSnapshots } from '../shared/events.js';

function Overlay() {
  const [view, setView] = useState<OverlayView | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const close = subscribeSnapshots('/api/overlay/events', (value) => { try { setNow(Date.now()); setView(overlayViewSchema.parse(value)); } catch { setView(null); } }, () => setView(null));
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => { close(); clearInterval(timer); };
  }, []);
  const phase = view?.enabled ? view.presentation.phase : 'hidden', result = view?.result;
  return <main className={`overlay-root ${view?.position ?? 'bottom-left'} ${view?.motion ? '' : 'no-motion'}`} data-state={phase ?? 'hidden'} data-job-id={view?.presentation.job_id ?? ''}>
    {view && phase !== 'hidden' && <section key={view.presentation.job_id ?? view.presentation.source_ids.join(':')} className={`broadcast-card ${result?.type === 'vod' ? 'vod-card' : ''}`}>
      <div className="broadcast-kicker">{result?.type === 'vod' ? 'CHECK THE VOD' : phase === 'message' ? 'FROM THE CONVERSATION' : 'CHAT, IS THIS REAL?'}</div>
      <div className="broadcast-body"><p className="broadcast-claim">{phase === 'message' || phase === 'checking' ? view.presentation.message_text || 'Reviewing a chat claim…' : result?.claim}</p>
        {phase === 'checking' && (view.votes ? <div className="broadcast-votes"><div className="vote-instructions"><span>1 = REAL</span><span>2 = NOT REAL</span></div><div className="live-vote-bars"><i style={{ width: `${view.votes.real + view.votes.not_real ? view.votes.real / (view.votes.real + view.votes.not_real) * 100 : 50}%` }}/></div><div className="vote-totals"><span>{view.votes.real} CALL{view.votes.real === 1 ? '' : 'S'}</span><span>{view.votes.not_real} CALL{view.votes.not_real === 1 ? '' : 'S'}</span></div><p>{view.votes.closed ? view.waiting_for_review ? 'VOTES LOCKED · WAITING FOR THE STREAMER' : 'VOTES LOCKED' : 'FIRST VOTE COUNTS · CHECKING THE SOURCES'}</p><div className="vote-timer">{view.votes.closed ? 'LOCKED' : `${Math.min(60, Math.max(0, Math.ceil((Date.parse(view.votes.closes_at) - now) / 1000)))}s MAX`}</div></div> : <div className="checking-label"><i/>CHECKING THE SOURCES</div>)}
        {result && <><div className={`broadcast-stamp ${result.type === 'vod' ? 'vod' : result.verdict}`}>{result.type === 'vod' ? result.found ? "IT'S IN THE VOD" : 'NOT FOUND' : verdictLabel(result.verdict)}</div>
          {result.type === 'fact' ? <><p className="broadcast-explanation">{result.explanation}</p><div className="broadcast-source">{result.evidence[0] ? result.sources.find((source) => source.id === result.evidence[0]?.source_id)?.domain : 'No verified source'}</div></> : <><p className="broadcast-quote">{result.found ? `“${result.quote}”` : 'No matching moment in the indexed transcript.'}</p>{result.found && <div className="broadcast-time">{clock(result.offset_s ?? 0)} <span>{result.timing === 'word' ? 'IN THE STREAM' : 'APPROXIMATE TIME'}</span></div>}</>}
        </>}
        {view.votes?.revealed && <div className="chat-call-summary">{view.votes.no_call ? 'NO CALL · NO POINTS AWARDED' : view.votes.real + view.votes.not_real ? `CHAT SAID ${Math.round(view.votes.real / (view.votes.real + view.votes.not_real) * 100)}% REAL` : 'NO VOTES CAST'}</div>}
      </div><div className="broadcast-footer"><span>CHAT, IS THIS REAL?</span><span>THE REPLAY BOOTH</span></div>
    </section>}
    {view && view.enabled && !!view.leaders.length && <aside className="broadcast-leaders"><h2>CHAT CALLED IT</h2>{view.leaders.map((leader) => <div key={leader.rank}><span>CALLER {String(leader.rank).padStart(2, '0')}</span><strong>{leader.points} PT{leader.points === 1 ? '' : 'S'}</strong></div>)}</aside>}
  </main>;
}
document.documentElement.classList.add('overlay-document');
createRoot(document.getElementById('root')!).render(<Overlay/>);
