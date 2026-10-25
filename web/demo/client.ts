import { demoBridgeReplySchema } from '../../src/shared/schemas.js';

const listeners = new Map<string, Set<(value: unknown) => void>>(), snapshots = new Map<string, unknown>();
const pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let worker: SharedWorker | undefined, next = 0, failure = '';
function connect() {
  if (worker) return worker;
  if (typeof SharedWorker === 'undefined') throw new Error('This browser cannot open the recorded demo. Use a desktop browser or run npm run demo locally.');
  worker = new SharedWorker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'chat-is-this-real-recorded-demo' });
  worker.port.start();
  const failed = (message: string) => { failure = message; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); } pending.clear(); };
  worker.onerror = () => failed('The recorded demo could not start. Reload this page.');
  worker.port.onmessage = (event: MessageEvent<unknown>) => {
    const parsed = demoBridgeReplySchema.safeParse(event.data); if (!parsed.success) return;
    const value = parsed.data;
    if (value.type === 'failed') { failed(value.error); return; }
    if (value.type === 'snapshot') { snapshots.set(value.path, value.value); listeners.get(value.path)?.forEach((listener) => listener(value.value)); return; }
    const item = pending.get(value.id); if (!item) return;
    clearTimeout(item.timer); pending.delete(value.id); item.resolve(Response.json(value.ok ? value.value : { error: value.error }, { status: value.ok ? 200 : 409 }));
  };
  addEventListener('pagehide', () => { worker?.port.postMessage({ type: 'close' }); worker?.port.close(); worker = undefined; }, { once: true });
  return worker;
}
export async function demoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (init.signal?.aborted) throw init.signal.reason;
  const port = connect().port; if (failure) throw new Error(failure);
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The recorded demo did not answer. Reload this page.')); }, 15_000);
    pending.set(id, { resolve, reject, timer });
    port.postMessage({ id, path, method: init.method ?? 'GET', ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}) });
  });
}
export function demoSubscribe(path: string, listener: (value: unknown) => void): () => void {
  connect(); const group = listeners.get(path) ?? new Set(); group.add(listener); listeners.set(path, group);
  if (snapshots.has(path)) listener(snapshots.get(path));
  return () => { group.delete(listener); };
}
