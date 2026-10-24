import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

export function registerWebRoutes(app: FastifyInstance): void {
  const root = fileURLToPath(new URL('../../web-dist/', import.meta.url));
  if (!existsSync(`${root}index.html`)) return;
  app.register(fastifyStatic, { root: `${root}assets`, prefix: '/assets/', decorateReply: true });
  for (const route of ['/', '/library', '/settings', '/r/:id']) app.get(route, async (_request, reply) => reply.sendFile('index.html', root));
  app.get('/overlay', async (_request, reply) => reply.sendFile('overlay.html', root));
  app.get('/favicon.svg', async (_request, reply) => reply.sendFile('favicon.svg', root));
  app.get('/favicon.ico', async (_request, reply) => reply.code(204).send());
  app.register(fastifyStatic, { root: `${root}font-licenses`, prefix: '/font-licenses/', decorateReply: false });
}
