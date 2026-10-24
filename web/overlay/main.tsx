import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import { overlayViewSchema, type OverlayView } from '../../src/shared/schemas.js';
import { readApi } from '../shared/api.js';
import { clock, verdictLabel } from '../shared/ui.js';
import '../shared/styles.css';
import './overlay.css';

function Overlay() {
  const [view, setView] = useState<OverlayView | null>(null);
  useEffect(() => { const abort = new AbortController(); const load = () => void readApi('/api/overlay', overlayViewSchema, abort.signal).then(setView).catch(() => setView(null)); load(); const timer = setInterval(load, 300); return () => { abort.abort(); clearInterval(timer); }; }, []);
  const phase = view?.enabled ? view.presentation.phase : 'hidden', result = view?.result;
  return <main className={`overlay-root ${view?.position ?? 'bottom-left'} ${view?.motion ? '' : 'no-motion'}`} data-state={phase ?? 'hidden'} data-job-id={view?.presentation.job_id ?? ''}>
    {view && phase !== 'hidden' && <section key={view.presentation.updated_at} className={`broadcast-card ${result?.type === 'vod' ? 'vod-card' : ''}`}>
      <div className="broadcast-kicker">{result?.type === 'vod' ? 'CHECK THE VOD' : phase === 'message' ? 'FROM THE CONVERSATION' : 'CHAT, IS THIS REAL?'}</div>
      <div className="broadcast-body"><p className="broadcast-claim">{phase === 'message' ? view.presentation.message_text : result?.claim}</p>
        {result && <><div className={`broadcast-stamp ${result.type === 'vod' ? 'vod' : result.verdict}`}>{result.type === 'vod' ? result.found ? "IT'S IN THE VOD" : 'NOT FOUND' : verdictLabel(result.verdict)}</div>
          {result.type === 'fact' ? <><p className="broadcast-explanation">{result.explanation}</p><div className="broadcast-source">{result.evidence[0] ? result.sources.find((source) => source.id === result.evidence[0]?.source_id)?.domain : 'No verified source'}</div></> : <><p className="broadcast-quote">{result.found ? `“${result.quote}”` : 'No matching moment in the indexed transcript.'}</p>{result.found && <div className="broadcast-time">{clock(result.offset_s ?? 0)} <span>{result.timing === 'word' ? 'IN THE STREAM' : 'APPROXIMATE TIME'}</span></div>}</>}
        </>}
      </div><div className="broadcast-footer"><span>CHAT, IS THIS REAL?</span><span>{view.demo ? 'RECORDED DEMO' : 'THE REPLAY BOOTH'}</span></div>
    </section>}
  </main>;
}
document.documentElement.classList.add('overlay-document');
createRoot(document.getElementById('root')!).render(<Overlay/>);
