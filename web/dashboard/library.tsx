import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { libraryImportsSchema, libraryListSchema, libraryVodsSchema, segmentListSchema, type TranscriptSegment } from '../../src/shared/schemas.js';
import { errorMessage, mutate, readApi, uploadMedia } from '../shared/api.js';
import { Badge, Button, clock, Dialog, Icon, shortDate } from '../shared/ui.js';

export function Library({ demo, connected, onVod, notify }: { demo: boolean; connected: boolean; onVod: () => void; notify: (message: string) => void }) {
  const [broadcasts, setBroadcasts] = useState<z.infer<typeof libraryListSchema>['broadcasts']>([]), [videos, setVideos] = useState<z.infer<typeof libraryVodsSchema>['videos']>([]);
  const [imports, setImports] = useState<z.infer<typeof libraryImportsSchema>['imports']>([]), [selected, setSelected] = useState(''), [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [query, setQuery] = useState(''), [upload, setUpload] = useState(false), [file, setFile] = useState<File | null>(null), [vod, setVod] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [library, jobs] = await Promise.all([readApi('/api/library', libraryListSchema), readApi('/api/library/imports', libraryImportsSchema)]);
      setBroadcasts(library.broadcasts); setImports(jobs.imports); setSelected((current) => current || library.broadcasts[0]?.id || '');
      if (connected) { const owned = await readApi('/api/library/vods', libraryVodsSchema); setVideos(owned.videos); setVod((current) => current || owned.videos[0]?.id || ''); }
      setError('');
    } catch (caught) { setError(errorMessage(caught)); }
  }, [connected]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!imports.some((job) => ['receiving', 'transcribing'].includes(job.state))) return; const timer = setInterval(() => void load(), 1500); return () => clearInterval(timer); }, [imports, load]);
  const search = useCallback(async () => {
    if (!selected) return;
    try { setSegments((await readApi(`/api/library/segments?broadcast_id=${encodeURIComponent(selected)}&q=${encodeURIComponent(query)}`, segmentListSchema)).segments); setError(''); }
    catch (caught) { setError(errorMessage(caught)); }
  }, [selected, query]);
  const indexedSegments = broadcasts.find((broadcast) => broadcast.id === selected)?.coverage.segment_count;
  useEffect(() => { if (selected) { void readApi(`/api/library/segments?broadcast_id=${encodeURIComponent(selected)}`, segmentListSchema).then((value) => setSegments(value.segments)).catch((caught: unknown) => setError(errorMessage(caught))); } }, [selected, indexedSegments]);
  const performUpload = async () => {
    if (!file || !vod) return;
    setBusy(true);
    try {
      const extension = file.name.split('.').at(-1)?.toLowerCase();
      if (['srt', 'vtt', 'txt'].includes(extension ?? '')) {
        if (file.size > 3_000_000) throw new Error('Choose a smaller caption file.');
        await mutate('/api/library/subtitles', { vod_id: vod, format: extension, text: await file.text() });
      } else {
        if (demo) throw new Error('The recorded demo imports captions. Use connected local mode to transcribe media.');
        if (file.size > 2_147_483_648) throw new Error('Keep media files under 2 GB.');
        await uploadMedia(`/api/library/${vod}/media`, file);
      }
      setSelected(`upload-${vod}`); setQuery(''); setUpload(false); setFile(null); notify('Import accepted.'); await load();
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };
  const current = broadcasts.find((item) => item.id === selected);
  return <main className="library-page"><header className="page-heading"><div><span className="eyebrow">CHECK THE VOD</span><h1>Stream library</h1><p>Search the words behind the moment.</p></div><div className="page-actions"><Button icon="clock" onClick={onVod}>Find a moment</Button><Button icon="upload" tone="primary" onClick={() => { setError(''); setUpload(true); }}>Import broadcast</Button><Button icon="bars" onClick={() => void load()}>Refresh library</Button></div></header>
    {error && !upload && <p className="inline-error" role="alert">{error}</p>}
    <div className="library-layout"><section aria-label="Indexed broadcasts" className="broadcast-list"><h2 className="section-label">Indexed broadcasts <span>{broadcasts.length}</span></h2>{broadcasts.map((broadcast) => <button key={broadcast.id} className={`broadcast-option ${selected === broadcast.id ? 'selected' : ''}`} aria-pressed={selected === broadcast.id} onClick={() => { setSelected(broadcast.id); setQuery(''); }}><Icon name="library" size={25}/><span><strong>{broadcast.title}</strong><small>{shortDate(broadcast.started_at)} · {clock(broadcast.coverage.end_s - broadcast.coverage.start_s)} indexed</small></span><Badge>{broadcast.source === 'upload' ? 'Upload' : 'Recorded'}</Badge></button>)}</section>
      <section className="transcript-panel" aria-label="Transcript"><header className="panel-heading"><div><span className="eyebrow">THE STORED TRANSCRIPT</span><h2>{current?.title ?? 'Choose a broadcast'}</h2></div>{current && <Badge tone="vod">{current.coverage.segment_count} segments</Badge>}</header>
        <form className="transcript-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label className="search-field"><Icon name="search"/><span className="sr-only">Search transcript</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="A phrase, number or promise"/></label><Button icon="search" type="submit">Search transcript</Button></form>
        {current && <p className="fine-print">Coverage {clock(current.coverage.start_s)} to {clock(current.coverage.end_s)}{current.coverage.gaps.length ? ` · ${current.coverage.gaps.length} gaps` : ''}. Quotes and timecodes come from stored segments.</p>}
        <ol className="transcript-lines">{segments.map((segment) => <li key={segment.id}><time>{clock(segment.offset_s)}</time><p>{segment.text}</p></li>)}</ol>{!segments.length && <div className="empty-state"><p>No stored segments match this search.</p></div>}
      </section></div>
    {!!imports.length && <section className="import-jobs"><h2 className="section-label">Imports</h2>{imports.map((job) => <div key={job.id}><Badge tone={job.state === 'failed' ? 'failed' : ''}>{job.state}</Badge><span>{clock(job.progress_s)}{job.total_s ? ` / ${clock(job.total_s)}` : ''}</span>{job.reason && <span className="muted">{job.reason.replaceAll('_', ' ')}</span>}</div>)}</section>}
    {upload && <Dialog title="Import a past broadcast" onClose={() => setUpload(false)}><p className="muted">Link captions or media to a VOD you own. The current live transcript is kept separate.</p>{demo && <p className="review-note">Demo mode supports caption imports without model calls.</p>}<form onSubmit={(event) => { event.preventDefault(); void performUpload(); }}>
      <label className="field"><span>Past broadcast</span><select required value={vod} onChange={(event) => setVod(event.target.value)}><option value="">Choose your VOD</option>{videos.map((video) => <option key={video.id} value={video.id}>{video.title} · {shortDate(video.created_at)}</option>)}</select></label>
      <label className="file-drop"><Icon name="upload" size={28}/><strong>{file?.name ?? 'Choose captions or a recording'}</strong><span>SRT, VTT, timestamped TXT, audio or video</span><input aria-label="Broadcast file" type="file" accept=".srt,.vtt,.txt,audio/*,video/*" required onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label>
      {error && <p className="inline-error" role="alert">{error}</p>}<footer className="dialog-actions"><Button onClick={() => setUpload(false)}>Cancel import</Button><Button type="submit" tone="primary" disabled={!file || !vod || busy}>{busy ? 'Importing…' : 'Import file'}</Button></footer></form></Dialog>}
  </main>;
}
