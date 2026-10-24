import { useMemo, useState } from 'react';
import type { CheckRequest, StoredMessage } from '../../src/shared/schemas.js';
import { Badge, Button, Icon, shortTime } from '../shared/ui.js';

export function ChatPanel({ messages, requests, selected, onSelect, onViewer, onCheck, onShow, context, onLive }: {
  messages: StoredMessage[]; requests: CheckRequest[]; selected: string | null; onSelect: (id: string) => void;
  onViewer: (id: string) => void; onCheck: (ids: string[], kind: 'real' | 'vod') => void; onShow: (ids: string[]) => void;
  context: boolean; onLive: () => void
}) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const checked = useMemo(() => new Set(requests.flatMap((request) => request.source_message_ids)), [requests]);
  const rows = useMemo(() => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).filter((message) =>
    (!query || `${message.display_name} ${message.body ?? ''}`.toLowerCase().includes(query.toLowerCase())) &&
    (filter !== 'mods' || message.badges.some((badge) => ['moderator', 'broadcaster'].includes(badge.set_id))) && (filter !== 'checked' || checked.has(message.id))), [messages, query, filter, checked]);
  return <section className="chat-panel" aria-label="Live chat"><header className="panel-heading"><div><span className="eyebrow">THE CONVERSATION</span><h2>{context ? 'Stream context' : 'Live chat'} <span className="count">{messages.length}</span></h2></div>{context && <Button icon="back" onClick={onLive}>Back to live</Button>}</header>
    <label className="search-field"><Icon name="search"/><span className="sr-only">Search live chat</span><input type="search" value={query} placeholder="Find a message" onChange={(event) => setQuery(event.target.value)}/></label>
    <div className="filter-tabs" aria-label="Chat filters">{[['all', 'All'], ['mods', 'Mods'], ['checked', 'Checked']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value ?? 'all')}>{label}</button>)}</div>
    <ol className="chat-stream">{rows.map((message) => <li key={message.id} className={`chat-row ${selected === message.id ? 'selected' : ''}`} data-message-id={message.id}>
      <header><button className="user-name" onClick={() => onViewer(message.user_id)}>{message.display_name}</button>{message.badges.some((badge) => badge.set_id === 'moderator') && <Badge>MOD</Badge>}<time dateTime={message.created_at}>{shortTime(message.created_at)}</time></header>
      <button className="message-body" aria-label={`Select message: ${message.body ?? 'removed'}`} aria-expanded={selected === message.id} onClick={() => onSelect(message.id)}>{message.body ?? <span className="removed">{message.removed_reason === 'user_request' ? 'Removed by request' : 'Removed by moderation'}</span>}</button>
      {checked.has(message.id) && <span className="checked-marker"><Icon name="check" size={12}/>Checked</span>}
      {selected === message.id && <div className="message-actions"><Button icon="check" disabled={!message.body} onClick={() => onCheck([message.id], 'real')}>Check</Button><Button icon="clock" disabled={!message.body} onClick={() => onCheck([message.id], 'vod')}>VOD check</Button><Button icon="play" disabled={!message.body} onClick={() => onShow([message.id])}>Show</Button><Button icon="users" onClick={() => onViewer(message.user_id)}>Viewer</Button></div>}
    </li>)}</ol>{!rows.length && <div className="empty-state"><Icon name="chat" size={32}/><h3>No messages here yet</h3><p>Connect your channel, or adjust the search and filters.</p></div>}
    <footer className="panel-footer">Select a message to review it. <kbd>C</kbd> check <kbd>V</kbd> find in VOD</footer>
  </section>;
}
