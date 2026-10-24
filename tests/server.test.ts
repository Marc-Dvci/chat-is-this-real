import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { healthSchema } from '../src/shared/schemas.js';

describe('local server entry point', () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('serves the health contract through Fastify inject', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(healthSchema.parse(response.json())).toEqual({
      name: 'chat-is-this-real', status: 'ok', milestone: 'M0'
    });
  });

  it('does not serve local secrets or stored files', async () => {
    const app = buildApp();
    apps.push(app);

    for (const url of ['/.env', '/data/tokens.json', '/.git/config']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    }
  });
});
