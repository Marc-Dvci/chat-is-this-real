import type { DeskSnapshot } from '../../src/shared/schemas.js';
import { useState } from 'react';
import { mutate } from '../shared/api.js';
import { Button, Icon } from '../shared/ui.js';

export function Votes({ data }: { data: DeskSnapshot }) {
  const [error, setError] = useState('');
  const cast = (user: string, text: string) => { setError(''); void mutate('/api/demo/vote', { user, text }).catch(() => setError('The scripted vote could not be sent.')); };
  const vote = data.overlay.votes, total = vote ? vote.real + vote.not_real : 0;
  return <section className="callers-panel" aria-label="Chat votes"><header className="section-label"><span>CHAT CALLS IT</span><Icon name="bars" size={14}/></header>
    {vote ? <><div className="desk-vote-count"><span><b>{vote.real}</b> REAL</span><span><b>{vote.not_real}</b> NOT REAL</span></div><div className="desk-vote-bar"><i style={{ width: `${total ? vote.real / total * 100 : 50}%` }}/></div><p className="fine-print">{vote.closed ? data.overlay.waiting_for_review ? 'Votes locked. Review the result before revealing it.' : vote.no_call ? 'NO CALL. No points awarded.' : vote.revealed ? 'The result is revealed. Correct calls score one point.' : 'Votes locked.' : 'First vote counts. Type 1 for REAL or 2 for NOT REAL.'}</p></> : <p className="fine-print">A new claim check opens voting when it is on stream. Each viewer gets one call.</p>}
    {data.demo && vote && !vote.closed && <div className="scripted-votes"><span>SCRIPTED DEMO VIEWERS</span>{(['demo-user-1', 'demo-user-2', 'demo-user-3'] as const).map((user, index) => <div key={user}><span>Viewer {index + 1}</span><Button onClick={() => cast(user, '1')}>1 · REAL</Button><Button onClick={() => cast(user, '2')}>2 · NOT REAL</Button></div>)}</div>}{error && <p className="inline-error" role="alert">{error}</p>}
    <h3 className="section-label">Top callers <span>THIS STREAM</span></h3>{data.scores.length ? <ol className="caller-scores">{data.scores.map((score, index) => <li key={score.user_id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{score.display_name}</strong><b>{score.points} PT{score.points === 1 ? '' : 'S'}</b></li>)}</ol> : <p className="fine-print">No points yet. REAL and NOT REAL award points after the approved reveal.</p>}
  </section>;
}
