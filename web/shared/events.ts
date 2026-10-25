import { staticDemo } from './paths.js';

export function subscribeSnapshots(path: string, snapshot: (value: unknown) => void, error: () => void): () => void {
  let close = () => undefined as void, stopped = false;
  if (staticDemo()) {
    void import('../demo/client.js').then((client) => { if (!stopped) close = client.demoSubscribe(path, snapshot); }).catch(error);
  } else {
    const events = new EventSource(path);
    events.addEventListener('snapshot', (event: MessageEvent<string>) => { try { snapshot(JSON.parse(event.data)); } catch { error(); } });
    events.onerror = error; close = () => events.close();
  }
  return () => { stopped = true; close(); };
}
