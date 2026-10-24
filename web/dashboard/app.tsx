import { useCallback, useEffect, useState } from 'react';
import { checkJobSchema, messageListSchema, type CheckView, type StoredMessage } from '../../src/shared/schemas.js';
import { copyText, errorMessage, mutate, readApi } from '../shared/api.js';
import { Badge, Button, Dialog, Icon } from '../shared/ui.js';
import { ChatPanel } from './chat.js';
import { ChecksPanel } from './checks.js';
import { Library } from './library.js';
import { ResultPage } from './result.js';
import { Settings } from './settings.js';
import { useDesk } from './use-desk.js';
import { ViewerPanel } from './viewer.js';

export function App() {
  const resultId = /^\/r\/([^/]+)$/.exec(location.pathname)?.[1];
  return resultId ? <ResultPage id={resultId}/> : <Desk/>;
}
function Desk() {
  const { data, error, refresh } = useDesk();
  const [route, setRoute] = useState(location.pathname), [tab, setTab] = useState('chat');
  const [message, setMessage] = useState<string | null>(null), [check, setCheck] = useState<string | null>(null), [viewer, setViewer] = useState<string | null>(null);
  const [historyIds, setHistoryIds] = useState<string[]>([]), [context, setContext] = useState<StoredMessage[] | null>(null);
  const [composer, setComposer] = useState<'real' | 'vod' | null>(null), [text, setText] = useState(''), [toast, setToast] = useState(''), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ job: CheckView; action: 'show' | 'post' } | null>(null), [help, setHelp] = useState(false);
  const navigate = (path: string) => { history.pushState({}, '', path); setRoute(path); };
  useEffect(() => { const pop = () => setRoute(location.pathname); addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  const run = useCallback(async (task: () => Promise<unknown>, success?: string) => { setBusy(true); try { await task(); await refresh(); if (success) setToast(success); } catch (caught) { setToast(errorMessage(caught)); } finally { setBusy(false); } }, [refresh]);
  const checkMessages = useCallback((ids: string[], kind: 'real' | 'vod') => {
    void run(async () => { const job = checkJobSchema.parse(await mutate('/api/checks', { kind, message_ids: ids })); setCheck(job.id); setTab('checks'); setRoute('/'); history.pushState({}, '', '/'); });
  }, [run]);
  const showMessages = useCallback((ids: string[]) => { void run(() => mutate('/api/presentation', { action: 'show_message', message_ids: ids }), 'Message is on stream.'); }, [run]);
  const show = useCallback((job: CheckView, confirmed = false) => {
    if (job.outcome?.type === 'fact' && job.outcome.sensitive && !confirmed) { setConfirmation({ job, action: 'show' }); return; }
    void run(() => mutate('/api/presentation', { action: 'show_check', id: job.id, sensitive_confirmed: confirmed }), 'Result is on stream.');
  }, [run]);
  const post = (job: CheckView, confirmed = false) => {
    if (job.outcome?.type === 'fact' && job.outcome.sensitive && !confirmed) { setConfirmation({ job, action: 'post' }); return; }
    void run(() => mutate(`/api/checks/${job.id}/post`, { sensitive_confirmed: confirmed }), data?.demo ? 'Scripted reply added to demo chat.' : 'Reply sent to Twitch.');
  };
  const hide = useCallback(() => { void run(() => mutate('/api/presentation', { action: 'hide' }), 'Overlay hidden.'); }, [run]);
  const openViewer = (id: string) => { setViewer(id); setTab('viewer'); };
  const currentMessages = context ?? data?.messages ?? [];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input,textarea,select,[contenteditable="true"],dialog') || event.ctrlKey || event.altKey || event.metaKey) || composer || confirmation || help || route !== '/') return;
      const ids = tab === 'viewer' ? historyIds : message ? [message] : [];
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); const rows = [...currentMessages].reverse(); const index = rows.findIndex((item) => item.id === message);
        setMessage(rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.id ?? null); setTab('chat');
      } else if (event.key.toLowerCase() === 'h') hide();
      else if (event.key.toLowerCase() === 'c') { if (ids.length) checkMessages(ids, 'real'); else setComposer('real'); }
      else if (event.key.toLowerCase() === 'v') { if (ids.length) checkMessages(ids, 'vod'); else setComposer('vod'); }
      else if (event.key.toLowerCase() === 's') { const job = data?.checks.find((item) => item.id === check); if (tab === 'checks' && job) show(job); else if (ids.length) showMessages(ids); }
      else if (event.key === 'Escape') { setViewer(null); setTab('chat'); setMessage(null); }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [tab, historyIds, message, currentMessages, check, data, composer, confirmation, help, route, hide, checkMessages, show, showMessages]);
  const openComposer = (kind: 'real' | 'vod') => { setText(''); setComposer(kind); };
  if (!data) return <main className="loading-page"><span className="wordmark">CHAT, IS THIS REAL?</span><p role="status">{error || 'Opening the review booth…'}</p></main>;
  const overlayOn = data.settings.overlay_enabled, model = data.models.last;
  return <div className="desk-shell" aria-busy={busy}>
    <header className="app-header"><a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}><span className="brand-symbol">?</span><span>CHAT, IS<br/>THIS REAL?</span></a>
      <nav aria-label="Main navigation">{[['/', 'Review desk', 'check'], ['/library', 'Library', 'library'], ['/settings', 'Settings', 'settings']].map(([path, label, icon]) => <a key={path} href={path} aria-current={route === path ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(path ?? '/'); }}><Icon name={icon ?? 'check'}/><span>{label}</span></a>)}</nav>
      <div className="header-end">{data.demo && <Badge tone="demo">RECORDED DEMO</Badge>}<button className="icon-button" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Icon name="help"/></button><Button icon="chat" disabled={busy} onClick={() => void run(() => mutate(`/api/twitch/${data.twitch.connected ? 'disconnect' : 'connect'}`), data.demo ? 'Demo connection updated.' : 'Twitch connection updated.')}>{data.twitch.connected ? 'Disconnect' : 'Connect Twitch'}</Button></div>
    </header>
    <div className="status-strip"><span className={data.twitch.connected ? 'status connected' : 'status'}><i/>{data.demo ? 'Recorded session' : data.twitch.connected ? 'Twitch connected' : 'Twitch disconnected'}</span><span><Icon name="clock" size={13}/>{Math.floor(data.indexed_s / 60)} min indexed{data.companion.state === 'recorded' ? '' : data.companion.last_chunk_at ? ` · ${Math.max(0, Math.floor((Date.now() - Date.parse(data.companion.last_chunk_at)) / 1000))}s since audio${data.companion.state === 'stale' ? ' · stale' : ''}` : ' · waiting for audio'}</span><span className="model-status"><Icon name="bars" size={13}/>{data.models.recorded ? 'Recorded model runs' : model ? `${model.status} · ${(model.latency_ms / 1000).toFixed(1)}s` : 'No model calls today'}<b>{data.models.calls} calls · {data.models.search_calls} searches</b></span><span className="privacy-status"><Icon name="shield" size={13}/>{data.settings.history_enabled ? `${data.settings.retention_days}-day history` : 'History off'}</span></div>
    {data.demo && <div className="demo-notice"><span>PLAY THE RECEIPTS.</span> Scripted chat. Recorded model results. No keys or paid calls.<button onClick={() => openComposer('real')}>Try a check <Icon name="arrow" size={14}/></button></div>}
    {error && <p className="connection-error" role="alert">{error}</p>}
    {route === '/library' ? <Library demo={data.demo} connected={data.twitch.connected} onVod={() => openComposer('vod')} notify={setToast}/> : route === '/settings' ? <Settings data={data} refresh={refresh} notify={setToast}/> : <>
      <div className="desk-toolbar"><div><span className="eyebrow">YOUR STREAM. YOUR CALL.</span><h1>Show the receipts.</h1></div><div className="overlay-controls"><label className="inline-switch"><input type="checkbox" role="switch" checked={overlayOn} onChange={(event) => void run(() => mutate('/api/settings', { overlay_enabled: event.target.checked }, 'PATCH'))}/>Overlay</label><label className="inline-switch"><input type="checkbox" role="switch" checked={data.settings.votes_enabled} onChange={(event) => void run(() => mutate('/api/settings', { votes_enabled: event.target.checked }, 'PATCH'))}/>Votes</label><Button icon="hide" onClick={hide}>Hide now <kbd>H</kbd></Button></div></div>
      <div className="dock-tabs" role="tablist" aria-label="Review panels">{['chat', 'checks', 'viewer'].map((name) => <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name === 'chat' ? 'Chat' : name === 'checks' ? 'Checks' : 'Viewer'}{name === 'checks' && <span>{data.checks.filter((item) => item.state === 'ready').length}</span>}</button>)}</div>
      <main className={`review-layout ${viewer ? 'has-viewer' : ''} tab-${tab}`}><ChatPanel messages={currentMessages} requests={data.requests} selected={message} onSelect={(id) => { setMessage(id); setTab('chat'); }} onViewer={openViewer} onCheck={checkMessages} onShow={showMessages} context={Boolean(context)} onLive={() => setContext(null)}/>
        <ChecksPanel data={data} selected={check} onSelect={(id) => { setCheck(id); setTab('checks'); }} onNew={() => openComposer('real')} onShow={show} onPost={post} onCopy={(job) => void run(() => copyText(`${location.origin}/r/${job.id}`), 'Result link copied.')} onDismiss={(job) => void run(() => mutate(`/api/checks/${job.id}/dismiss`), 'Check dismissed.')} onViewer={openViewer}/>
        {viewer ? <ViewerPanel userId={viewer} requests={data.requests} onClose={() => { setViewer(null); setTab('chat'); }} onCheck={checkMessages} onShow={showMessages} onSelection={setHistoryIds} onContext={(id) => void run(async () => { setContext((await readApi(`/api/history/context?id=${encodeURIComponent(id)}`, messageListSchema)).messages); setMessage(id); setTab('chat'); })}/> : <aside className="viewer-placeholder"><Icon name="users" size={30}/><h2>Know the context.</h2><p>Select a username to see their stored messages and check the whole conversation.</p></aside>}
      </main></>}
    <footer className="app-footer"><span>CHAT, IS THIS REAL? <b>THE REPLAY BOOTH</b></span><a href="/overlay" target="_blank" rel="noreferrer">OBS overlay <Icon name="external" size={12}/></a><button onClick={() => setHelp(true)}>Shortcuts <kbd>?</kbd></button></footer>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast && <><Icon name="check"/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close"/></button></>}</div>
    {composer && <Dialog title={composer === 'vod' ? 'Check the VOD' : 'Check a claim'} onClose={() => setComposer(null)}><p className="muted">{composer === 'vod' ? 'Find a quote or promise in your indexed streams.' : 'Review the evidence before you put the result on stream.'}</p><form onSubmit={(event) => { event.preventDefault(); void run(async () => { const job = checkJobSchema.parse(await mutate('/api/checks', { kind: composer, claim: text })); setCheck(job.id); setTab('checks'); navigate('/'); setComposer(null); }); }}><label className="field"><span>{composer === 'vod' ? 'What are you looking for?' : 'The claim'}</span><textarea required maxLength={1000} rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={composer === 'vod' ? 'Did you promise fifty push-ups?' : 'Enter the message you want to check'}/></label>
      {data.demo && <div className="recorded-examples"><span className="section-label">Recorded examples</span>{data.samples.filter((sample) => sample.kind === composer).map((sample) => <button key={sample.key} type="button" onClick={() => setText(sample.text)}>{sample.text}<Icon name="arrow" size={14}/></button>)}</div>}
      <footer className="dialog-actions"><Button onClick={() => setComposer(composer === 'real' ? 'vod' : 'real')}>{composer === 'real' ? 'Switch to VOD' : 'Switch to claim'}</Button><Button type="submit" tone="primary" icon="check" disabled={!text.trim() || busy}>Start check</Button></footer></form></Dialog>}
    {confirmation && <Dialog title="Confirm a sensitive claim" onClose={() => setConfirmation(null)}><p>This claim needs an extra review before it reaches viewers.</p><blockquote>{confirmation.job.input?.claim}</blockquote><footer className="dialog-actions"><Button onClick={() => setConfirmation(null)}>Keep private</Button><Button tone="primary" onClick={() => { const value = confirmation; setConfirmation(null); if (value.action === 'show') show(value.job, true); else post(value.job, true); }}>Confirm and {confirmation.action === 'show' ? 'show' : 'post'}</Button></footer></Dialog>}
    {help && <Dialog title="Keep your hands on the stream" onClose={() => setHelp(false)}><dl className="shortcut-list">{[['↑ / ↓', 'Select a message'], ['C', 'Check the selection'], ['V', 'Find it in the VOD'], ['S', 'Show the selection on stream'], ['H', 'Hide the overlay'], ['Esc', 'Close the viewer panel']].map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl><p className="fine-print">Shortcuts pause while you type or use a dialog.</p><Button tone="primary" onClick={() => setHelp(false)}>Back to the desk</Button></Dialog>}
  </div>;
}
