import { randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { oauthCallbackSchema, type TwitchConfig, type UserTokenRole } from '../shared/schemas.js';

export const twitchRedirectUri = 'http://localhost:4747/auth/callback';

export const twitchScopes = {
  bot: ['user:read:chat', 'user:write:chat', 'user:bot'],
  broadcaster: ['channel:bot', 'channel:manage:clips', 'clips:edit']
} as const;

export const testStreamScopes = ['channel:read:stream_key', 'channel:manage:broadcast', 'user:write:chat'] as const;

export function authorizationUrl(clientId: string, role: UserTokenRole, state: string, extraScopes: readonly string[] = []): string {
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: twitchRedirectUri,
    response_type: 'code', scope: [...twitchScopes[role], ...extraScopes].join(' '), state, force_verify: 'true'
  }).toString();
  return url.href;
}

export function createOAuthSetup(
  config: TwitchConfig, exchange: (role: UserTokenRole, code: string) => Promise<void>,
  extraScopes: Partial<Record<UserTokenRole, readonly string[]>> = {}
) {
  const app = Fastify({ logger: false });
  const pending = new Map<string, { role: UserTokenRole; expires: number }>();
  const connected = new Set<UserTokenRole>();

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.get('/auth/callback', async (request, reply) => {
    const query = oauthCallbackSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).type('text/plain').send('Invalid authorization response. Restart setup.');

    const supplied = Buffer.from(query.data.state);
    let match: { state: string; role: UserTokenRole } | undefined;
    for (const [state, attempt] of pending) {
      const expected = Buffer.from(state);
      if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
        if (attempt.expires > Date.now()) match = { state, role: attempt.role };
        break;
      }
    }
    if (!match) return reply.code(400).type('text/plain').send('Authorization expired or state did not match. Restart setup.');
    pending.delete(match.state);
    if (query.data.error || !query.data.code) {
      return reply.code(400).type('text/plain').send('Authorization was declined. Restart setup to try again.');
    }
    try {
      await exchange(match.role, query.data.code);
      connected.add(match.role);
      return reply.type('text/plain').send(`${match.role === 'bot' ? 'Bot' : 'Broadcaster'} connected. Return to the setup terminal.`);
    } catch {
      return reply.code(400).type('text/plain').send('Could not connect this account. Check that you signed in to the configured account, then restart setup.');
    }
  });

  return {
    app,
    connected,
    begin(role: UserTokenRole): string {
      for (const [state, attempt] of pending) if (attempt.role === role || attempt.expires <= Date.now()) pending.delete(state);
      const state = randomBytes(32).toString('hex');
      pending.set(state, { role, expires: Date.now() + 10 * 60_000 });
      return authorizationUrl(config.TWITCH_CLIENT_ID, role, state, extraScopes[role]);
    }
  };
}
