import { useEffect, useMemo, useState } from 'react';
import { messageListSchema, type CheckRequest, type StoredMessage } from '../../src/shared/schemas.js';
import { readApi, errorMessage } from '../shared/api.js';
import { Badge, Button, Icon, shortDate, shortTime } from '../shared/ui.js';

export function ViewerPanel({ userId, requests, onClose, onCheck, onShow, onContext, onSelection }: {
  userId: string; requests: CheckRequest[]; onClose: () => void; onCheck: (ids: string[], kind: 'real' | 'vod') => void;
  onShow: (ids: string[]) => void; onContext: (id: string) => void; onSelection: (ids: string[]) => void
}) {
  const [messages, setMessages] = useState<StoredMessage[]>([]), [query, setQuery] = useState(''), [stream, setStream] = useState(''), [selected, setSelected] = useState<string[]>([]), [error, setError] = useState('');
  useEffect(() => { const abort = new AbortController(); setSelected([]); onSelection([]);
    void readApi(`/api/history?user=${encodeURIComponent(userId)}&limit=200`, messageListSchema, abort.signal).then((value) => { setMessages(value.messages); setError(''); }).catch((caught: unknown) => { if (!abort.signal.aborted) setError(errorMessage(caught)); });
    return () => abort.abort();
  }, [userId, onSelection]);
  const checked = new Set(requests.flatMap((request) => request.source_message_ids));
  const streams = useMemo(() => [...new Set(messages.map((message) => message.broadcast_id))], [messages]);
  const visible = messages.filter((message) => (!stream || message.broadcast_id === stream) && (!query || message.body?.toLowerCase().includes(query.toLowerCase())));
  const groups = [...new Set(visible.map((message) => message.broadcast_id))];
  const toggle = (id: string) => { const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]; setSelected(next); onSelection(next); };
  return <aside className="viewer-panel" aria-label="Viewer history"><header className="panel-heading"><div><span className="eyebrow">VIEWER HISTORY</span><h2>{messages[0]?.display_name ?? 'Viewer'}</h2></div><button className="icon-button" aria-label="Close viewer history" onClick={onClose}><Icon name="close"/></button></header>
    <p className="fine-print">Private to this dashboard. Names stay off the overlay.</p><label className="search-field"><Icon name="search"/><span className="sr-only">Search viewer history</span><input type="search" placeholder="Search their messages" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <label className="field compact"><span>Stream</span><select value={stream} onChange={(event) => setStream(event.target.value)}><option value="">All stored streams</option>{streams.map((id) => <option key={id} value={id}>{shortDate(messages.find((message) => message.broadcast_id === id)?.created_at ?? new Date().toISOString())}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}<div className="viewer-history">{groups.map((group) => <section key={group}><h3 className="stream-divider">{shortDate(visible.find((message) => message.broadcast_id === group)?.created_at ?? new Date().toISOString())}</h3>{visible.filter((message) => message.broadcast_id === group).map((message) => <article className={`history-row ${selected.includes(message.id) ? 'selected' : ''}`} key={message.id}>
      <label><input type="checkbox" checked={selected.includes(message.id)} disabled={!message.body} aria-label={`Select history: ${message.body ?? 'removed'}`} onChange={() => toggle(message.id)}/><span><time>{shortTime(message.created_at)}</time>{message.body ?? <em>Removed by moderation or request</em>}</span></label>
      <div className="history-meta">{checked.has(message.id) && <Badge>Checked</Badge>}<button className="text-button" onClick={() => onContext(message.id)}>Jump to context <Icon name="arrow" size={13}/></button></div>
    </article>)}</section>)}</div>
    {!visible.length && <div className="empty-state"><p>No stored messages match. History begins when it is enabled.</p></div>}
    <footer className="selection-tray"><span>{selected.length} selected</span><div><Button icon="check" tone="primary" disabled={!selected.length} onClick={() => onCheck(selected, 'real')}>Check selected</Button><Button icon="clock" disabled={!selected.length} onClick={() => onCheck(selected, 'vod')}>VOD selected</Button><Button icon="play" disabled={!selected.length} onClick={() => onShow(selected)}>Show on stream</Button></div></footer>
  </aside>;
}
