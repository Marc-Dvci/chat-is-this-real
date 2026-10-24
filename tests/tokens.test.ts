import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { TwitchTokens } from '../src/twitch/tokens.js';
import { tokenFileSchema } from '../src/shared/schemas.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it('validates and persists an app token with the recorded null-scopes response', async () => {
  const issued: unknown = JSON.parse(await readFile('fixtures/twitch/app-token.json', 'utf8'));
  const validated: unknown = JSON.parse(await readFile('fixtures/twitch/app-validation.json', 'utf8'));
  const requests: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    requests.push({ url, method: options.method ?? 'GET' });
    if (url === 'https://id.twitch.tv/oauth2/token' && options.method === 'POST') {
      return Response.json(issued);
    }
    if (url === 'https://id.twitch.tv/oauth2/validate' && options.headers && 'Authorization' in options.headers) {
      expect(options.headers.Authorization).toBe('OAuth recorded-app-credential');
      return Response.json(validated);
    }
    throw new Error('Unexpected Twitch request.');
  });
  const directory = await mkdtemp(join(tmpdir(), 'chat-is-this-real-tokens-'));
  directories.push(directory);
  const path = join(directory, 'tokens.json');
  const tokens = await TwitchTokens.open({
    TWITCH_CLIENT_ID: 'demo_application', TWITCH_CLIENT_SECRET: 'local-placeholder',
    TWITCH_CHANNEL: 'demo_streamer', TWITCH_BOT: 'demo_bot'
  }, path);
  const app = await tokens.get('app');
  expect(app.scopes).toEqual([]);
  expect(app.user_id).toBeUndefined();
  const persisted = tokenFileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  expect(persisted.app?.access_token).toBe('recorded-app-credential');
  expect(persisted.app?.scopes).toEqual([]);
  expect(await tokens.get('app')).toEqual(app);
  expect(requests).toEqual([
    { url: 'https://id.twitch.tv/oauth2/token', method: 'POST' },
    { url: 'https://id.twitch.tv/oauth2/validate', method: 'GET' }
  ]);
});
