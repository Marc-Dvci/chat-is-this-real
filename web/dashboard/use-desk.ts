import { useCallback, useEffect, useRef, useState } from 'react';
import { deskSnapshotSchema, type DeskSnapshot } from '../../src/shared/schemas.js';
import { errorMessage, readApi } from '../shared/api.js';

export function useDesk() {
  const [data, setData] = useState<DeskSnapshot | null>(null), [error, setError] = useState('');
  const revision = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const started = revision.current;
    try { const next = await readApi('/api/desk', deskSnapshotSchema, signal); if (revision.current === started) setData(next); setError(''); }
    catch (caught) { if (!signal?.aborted) setError(errorMessage(caught)); }
  }, []);
  useEffect(() => {
    const abort = new AbortController(); void refresh(abort.signal);
    const events = new EventSource('/api/desk/events');
    events.addEventListener('snapshot', (event: MessageEvent<string>) => {
      try { const next = deskSnapshotSchema.parse(JSON.parse(event.data)); revision.current++; setData(next); setError(''); }
      catch { setError('The dashboard update could not be read. Reload the page.'); }
    });
    events.onerror = () => setError('Reconnecting to the local dashboard…');
    return () => { abort.abort(); events.close(); };
  }, [refresh]);
  return { data, error, refresh };
}
