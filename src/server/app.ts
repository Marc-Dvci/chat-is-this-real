import Fastify from 'fastify';
import { z } from 'zod';
import { healthSchema, type Health } from '../shared/schemas.js';

export function buildApp() {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576
  });

  app.get('/api/health', {
    schema: { response: { 200: z.toJSONSchema(healthSchema) } }
  }, async (_request, reply): Promise<Health> => {
    reply.header('Cache-Control', 'no-store');
    return { name: 'chat-is-this-real', status: 'ok', milestone: 'M0' };
  });

  return app;
}
