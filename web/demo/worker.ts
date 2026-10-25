import { demoBridgeCloseSchema, demoBridgeRequestSchema, demoCatalogSchema } from '../../src/shared/schemas.js';
import { DemoHost } from './host.js';
import { openBrowserDatabase } from './sqlite.js';

const ports = new Set<MessagePort>();
const ready = (async () => {
  const [db, catalogResponse, videosResponse] = await Promise.all([openBrowserDatabase(), fetch('/demo-data.json'), fetch('/demo-videos.json')]);
  if (!catalogResponse.ok || !videosResponse.ok) throw new Error('The recorded demo build is unavailable.');
  return new DemoHost(db, demoCatalogSchema.parse(await catalogResponse.json()), await videosResponse.json(), location.origin);
})();
let work = Promise.resolve(), lastDesk = '', lastOverlay = '';
void ready.then((host) => {
  setInterval(() => {
    try {
      const desk = host.snapshot(), overlay = desk.overlay, deskText = JSON.stringify(desk), overlayText = JSON.stringify(overlay);
      for (const port of ports) {
        if (deskText !== lastDesk) port.postMessage({ type: 'snapshot', path: '/api/desk/events', value: desk });
        if (overlayText !== lastOverlay) port.postMessage({ type: 'snapshot', path: '/api/overlay/events', value: overlay });
      }
      lastDesk = deskText; lastOverlay = overlayText;
    } catch { for (const port of ports) port.postMessage({ type: 'failed', error: 'The recorded demo could not update. Reload this page.' }); }
  }, 150);
}).catch(() => undefined);
Object.assign(globalThis, { onconnect(event: { ports: MessagePort[] }) {
  const port = event.ports[0]; if (!port) return;
  if (ports.size >= 16) { port.postMessage({ type: 'failed', error: 'Close an unused demo view and reload.' }); port.close(); return; }
  ports.add(port); port.start();
  void ready.then((host) => {
    port.postMessage({ type: 'snapshot', path: '/api/desk/events', value: host.snapshot() });
    port.postMessage({ type: 'snapshot', path: '/api/overlay/events', value: host.overlay() });
  }).catch(() => port.postMessage({ type: 'failed', error: 'The recorded demo could not start. Reload this page.' }));
  port.onmessage = (event: MessageEvent<unknown>) => {
    if (demoBridgeCloseSchema.safeParse(event.data).success) { ports.delete(port); port.close(); return; }
    const parsed = demoBridgeRequestSchema.safeParse(event.data); if (!parsed.success) return;
    work = work.then(async () => {
      try { const host = await ready, value = await host.request(parsed.data.path, parsed.data.method, parsed.data.body); port.postMessage({ type: 'response', id: parsed.data.id, ok: true, value }); }
      catch { port.postMessage({ type: 'response', id: parsed.data.id, ok: false, value: null, error: 'That recorded action could not finish. Check the selection and try again.' }); }
    });
  };
  port.onmessageerror = () => { ports.delete(port); port.close(); };
} });
