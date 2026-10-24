import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export function installDashboardSecurity(app: FastifyInstance): void {
  const token = randomBytes(32).toString('hex');
  app.addHook('onRequest', async (request, reply) => {
    let host: URL;
    try { host = new URL(`http://${request.headers.host ?? ''}`); }
    catch { return reply.code(403).send({ error: 'Invalid dashboard host.' }); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return reply.code(403).send({ error: 'Use the local dashboard address.' });
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (request.headers.origin && request.headers.origin !== host.origin) return reply.code(403).send({ error: 'Dashboard origin did not match.' });
    const supplied = typeof request.headers['x-dashboard-token'] === 'string' ? Buffer.from(request.headers['x-dashboard-token']) : Buffer.alloc(0);
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply.code(403).send({ error: 'Reload the dashboard before changing data.' });
  });
  app.get('/api/session', async () => ({ csrf_token: token }));
}
