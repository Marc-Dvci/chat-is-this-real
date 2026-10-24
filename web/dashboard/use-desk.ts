import { useCallback, useEffect, useState } from 'react';
import { deskSnapshotSchema, type DeskSnapshot } from '../../src/shared/schemas.js';
import { errorMessage, readApi } from '../shared/api.js';

export function useDesk() {
  const [data, setData] = useState<DeskSnapshot | null>(null), [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const next = await readApi('/api/desk', deskSnapshotSchema, signal); setData(next); setError(''); }
    catch (caught) { if (!signal?.aborted) setError(errorMessage(caught)); }
  }, []);
  useEffect(() => { const abort = new AbortController(); void refresh(abort.signal); const timer = setInterval(() => void refresh(abort.signal), 750);
    return () => { abort.abort(); clearInterval(timer); }; }, [refresh]);
  return { data, error, refresh };
}
