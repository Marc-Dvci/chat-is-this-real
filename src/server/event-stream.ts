import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

export function registerEventStream(app: FastifyInstance, path: string, snapshot: () => unknown): void {
  const clients = new Map<ServerResponse, { last: string }>();
  let version = 0, heartbeat = Date.now();
  const frame = (body: string) => `id: ${++version}\nevent: snapshot\ndata: ${body}\n\n`;
  app.get(path, async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return reply.code(403).send({ error: 'Use the local dashboard origin.' });
    if (clients.size >= 16) return reply.code(503).send({ error: 'Close an unused local view.' });
    const body = JSON.stringify(snapshot());
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    reply.raw.flushHeaders(); reply.raw.write(frame(body)); clients.set(reply.raw, { last: body });
    reply.raw.on('close', () => clients.delete(reply.raw));
  });
  const timer = setInterval(() => {
    if (!clients.size) return;
    let body: string;
    try { body = JSON.stringify(snapshot()); } catch { for (const client of clients.keys()) client.end(); clients.clear(); return; }
    const ping = Date.now() - heartbeat >= 15_000;
    if (ping) heartbeat = Date.now();
    for (const [client, state] of clients) {
      if (client.destroyed || client.writableLength > 2_000_000) { client.destroy(); clients.delete(client); continue; }
      if (state.last !== body) { client.write(frame(body)); state.last = body; }
      else if (ping) client.write(': keepalive\n\n');
    }
  }, 250); timer.unref();
  app.addHook('preClose', async () => { clearInterval(timer); for (const client of clients.keys()) client.end(); clients.clear(); });
}
