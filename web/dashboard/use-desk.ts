import { useCallback, useEffect, useRef, useState } from 'react';
import { deskSnapshotSchema, type DeskSnapshot } from '../../src/shared/schemas.js';
import { errorMessage, readApi } from '../shared/api.js';
import { subscribeSnapshots } from '../shared/events.js';

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
    const close = subscribeSnapshots('/api/desk/events', (value) => {
      try { const next = deskSnapshotSchema.parse(value); revision.current++; setData(next); setError(''); }
      catch { setError('The dashboard update could not be read. Reload the page.'); }
    }, () => setError('Reconnecting to the dashboard…'));
    return () => { abort.abort(); close(); };
  }, [refresh]);
  return { data, error, refresh };
}
