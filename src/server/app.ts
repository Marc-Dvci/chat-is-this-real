import Fastify from 'fastify';
import { z } from 'zod';
import { healthSchema, type Health } from '../shared/schemas.js';
import type { ChatSettings } from '../shared/schemas.js';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../store/database.js';
import { installDashboardSecurity } from './security.js';
import { registerHistoryRoutes } from './history-routes.js';
import { registerCheckRoutes } from './check-routes.js';
import { registerDashboardRoutes } from './dashboard-routes.js';
import { registerWebRoutes } from './web-routes.js';
import { loadDemoCatalog } from '../demo/replay.js';
import { seedDemo } from '../demo/seed.js';

export function buildApp(options: { db?: DatabaseSync; databasePath?: string; demo?: boolean; onSettings?: (settings: ChatSettings) => void; onRemoved?: (requestIds: string[]) => void } = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576
  });
  const db = options.db ?? openDatabase(options.databasePath ?? ':memory:');
  const catalog = options.demo ? loadDemoCatalog() : undefined;
  if (catalog) seedDemo(db, catalog);
  if (!options.db) app.addHook('onClose', async () => db.close());
  installDashboardSecurity(app);
  const checks = registerCheckRoutes(app, db, catalog);
  const desk = registerDashboardRoutes(app, db, checks);
  registerHistoryRoutes(app, db, {
    onSettings: (value) => { checks.settings(value); desk.settings(value); options.onSettings?.(value); },
    onRemoved: (ids) => { checks.removed(ids); desk.removed(); options.onRemoved?.(ids); },
    onPurge: (userId) => desk.purge(userId)
  });
  registerWebRoutes(app);

  app.get('/api/health', {
    schema: { response: { 200: z.toJSONSchema(healthSchema) } }
  }, async (_request, reply): Promise<Health> => {
    reply.header('Cache-Control', 'no-store');
    return { name: 'chat-is-this-real', status: 'ok', milestone: 'M0' };
  });

  return app;
}
