import { afterEach, describe, expect, it } from 'vitest';
import { createOAuthSetup, twitchRedirectUri } from '../src/twitch/oauth.js';
import type { TwitchConfig } from '../src/shared/schemas.js';

const config: TwitchConfig = {
  TWITCH_CLIENT_ID: 'local-test-application', TWITCH_CLIENT_SECRET: 'local-test-placeholder',
  TWITCH_CHANNEL: 'demo_streamer', TWITCH_BOT: 'demo_bot'
};

describe('authorization callback entry point', () => {
  const apps: ReturnType<typeof createOAuthSetup>['app'][] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it('rejects an unrelated state before exchanging a code', async () => {
    let exchanges = 0;
    const setup = createOAuthSetup(config, async () => { exchanges++; });
    apps.push(setup.app);
    const link = new URL(setup.begin('bot'));
    expect(link.searchParams.get('redirect_uri')).toBe(twitchRedirectUri);
    expect(link.searchParams.get('scope')?.split(' ')).toContain('user:bot');
    const response = await setup.app.inject({ url: '/auth/callback?state=unrelated&code=untrusted' });
    expect(response.statusCode).toBe(400);
    expect(exchanges).toBe(0);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.body).not.toContain('untrusted');
  });

  it('consumes a declined state so it cannot be replayed', async () => {
    let exchanges = 0;
    const setup = createOAuthSetup(config, async () => { exchanges++; });
    apps.push(setup.app);
    const state = new URL(setup.begin('broadcaster')).searchParams.get('state');
    const declined = await setup.app.inject({ url: `/auth/callback?state=${state}&error=access_denied` });
    expect(declined.statusCode).toBe(400);
    const replayed = await setup.app.inject({ url: `/auth/callback?state=${state}&code=untrusted` });
    expect(replayed.statusCode).toBe(400);
    expect(exchanges).toBe(0);
    expect(setup.connected.size).toBe(0);
  });

  it('rejects malformed callbacks without echoing their values', async () => {
    const setup = createOAuthSetup(config, async () => { throw new Error('No exchange expected.'); });
    apps.push(setup.app);
    const response = await setup.app.inject({ url: '/auth/callback?code=private-value' });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('private-value');
  });

  it('creates one-use state when the local start link is opened', async () => {
    const setup = createOAuthSetup(config, async () => undefined);
    apps.push(setup.app);
    const started = await setup.app.inject({ url: '/auth/start/broadcaster' });
    expect(started.statusCode).toBe(302);
    const destination = new URL(String(started.headers.location));
    expect(destination.hostname).toBe('id.twitch.tv');
    const state = destination.searchParams.get('state');
    expect(state).toHaveLength(64);
    const completed = await setup.app.inject({ url: `/auth/callback?state=${state}&code=local-test-code` });
    expect(completed.statusCode).toBe(200);
    expect((await setup.app.inject({ url: `/auth/callback?state=${state}&code=local-test-code` })).statusCode).toBe(400);
    expect((await setup.app.inject({ url: '/auth/start/app' })).statusCode).toBe(400);
  });
});
