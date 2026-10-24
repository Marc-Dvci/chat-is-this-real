import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  storedTokenSchema, tokenFileSchema, twitchTokenResponseSchema, twitchTokenValidationSchema,
  type StoredToken, type TokenFile, type TokenRole, type TwitchConfig, type UserTokenRole
} from '../shared/schemas.js';
import { twitchRedirectUri, twitchScopes } from './oauth.js';

export class TwitchHttpError extends Error {
  constructor(readonly status: number) {
    super(`Twitch request failed (HTTP ${status}).`);
    this.name = 'TwitchHttpError';
  }
}

export class TwitchTokens {
  private readonly inflight = new Map<TokenRole, Promise<StoredToken>>();
  private readonly validated = new Map<TokenRole, number>();
  private file: TokenFile;
  private writes: Promise<void> = Promise.resolve();

  private constructor(readonly config: TwitchConfig, private readonly path: string, file: TokenFile) {
    this.file = file;
  }

  static async open(config: TwitchConfig, path = 'data/tokens.json'): Promise<TwitchTokens> {
    let file: TokenFile = { version: 1, client_id: config.TWITCH_CLIENT_ID };
    try {
      file = tokenFileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (file.client_id !== config.TWITCH_CLIENT_ID) throw new Error('Client changed.');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new Error('Stored Twitch credentials do not match this application or are invalid. Reconnect Twitch.', { cause: error });
      }
    }
    return new TwitchTokens(config, path, file);
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.file, null, 2);
    const write = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    });
    this.writes = write.catch(() => undefined);
    await write;
  }

  private async tokenRequest(parameters: Record<string, string>): Promise<StoredToken> {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        client_id: this.config.TWITCH_CLIENT_ID, client_secret: this.config.TWITCH_CLIENT_SECRET, ...parameters
      })
    });
    if (!response.ok) throw new TwitchHttpError(response.status);
    const parsed = twitchTokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Twitch returned an invalid credential response.');
    return storedTokenSchema.parse({
      access_token: parsed.data.access_token,
      ...(parsed.data.refresh_token ? { refresh_token: parsed.data.refresh_token } : {}),
      expires_at: Date.now() + parsed.data.expires_in * 1000, scopes: parsed.data.scope
    });
  }

  private async validate(role: TokenRole, token: StoredToken): Promise<StoredToken> {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token.access_token}` }, signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new TwitchHttpError(response.status);
    const parsed = twitchTokenValidationSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Twitch returned an unexpected authorization response.');
    if (parsed.data.client_id !== this.config.TWITCH_CLIENT_ID) {
      throw new Error('Twitch authorization belongs to a different application.');
    }
    if (role !== 'app') {
      const expected = role === 'bot' ? this.config.TWITCH_BOT : this.config.TWITCH_CHANNEL;
      if (parsed.data.login?.toLowerCase() !== expected || !parsed.data.user_id) {
        throw new Error('Sign in to the configured Twitch account.');
      }
      if (twitchScopes[role].some((scope) => !parsed.data.scopes.includes(scope))) {
        throw new Error('Twitch authorization is missing a required permission. Reconnect Twitch.');
      }
    }
    this.validated.set(role, Date.now());
    return storedTokenSchema.parse({
      ...token, scopes: parsed.data.scopes, expires_at: Date.now() + parsed.data.expires_in * 1000,
      ...(parsed.data.login ? { login: parsed.data.login } : {}),
      ...(parsed.data.user_id ? { user_id: parsed.data.user_id } : {})
    });
  }

  async authorize(role: UserTokenRole, code: string, extraScopes: readonly string[] = []): Promise<void> {
    const issued = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: twitchRedirectUri });
    const token = await this.validate(role, issued);
    if (extraScopes.some((scope) => !token.scopes.includes(scope))) throw new Error('Twitch authorization is missing a requested test-stream permission.');
    this.file[role] = token;
    await this.persist();
  }

  async get(role: TokenRole, forceRefresh = false): Promise<StoredToken> {
    const existing = this.inflight.get(role);
    if (existing) return existing;
    const operation = this.getToken(role, forceRefresh);
    this.inflight.set(role, operation);
    try { return await operation; } finally { this.inflight.delete(role); }
  }

  private async getToken(role: TokenRole, forceRefresh: boolean): Promise<StoredToken> {
    let token = this.file[role];
    if (!token && role !== 'app') throw new Error(`Connect the ${role} account with npm run setup:twitch.`);
    if (!token || forceRefresh || token.expires_at <= Date.now() + 60_000) {
      const refresh = token?.refresh_token;
      if (role !== 'app' && !refresh) throw new Error('Reconnect Twitch to renew authorization.');
      const issued = await this.tokenRequest(role === 'app'
        ? { grant_type: 'client_credentials' }
        : { grant_type: 'refresh_token', refresh_token: refresh ?? '' });
      token = { ...token, ...issued, ...(issued.refresh_token ? {} : refresh ? { refresh_token: refresh } : {}) };
      forceRefresh = true;
    }
    if (forceRefresh || Date.now() - (this.validated.get(role) ?? 0) >= 60 * 60_000) {
      try {
        token = await this.validate(role, token);
      } catch (error) {
        if (error instanceof TwitchHttpError && error.status === 401 && !forceRefresh) {
          return this.getToken(role, true);
        }
        throw error;
      }
      this.file[role] = token;
      await this.persist();
    }
    return token;
  }

  loadedSecrets(): string[] {
    return [this.config.TWITCH_CLIENT_SECRET, ...Object.values(this.file).flatMap((entry) =>
      typeof entry === 'object' ? [entry.access_token, entry.refresh_token ?? ''] : [])];
  }

  async validateAll(): Promise<void> {
    for (const role of ['bot', 'broadcaster', 'app'] as const) {
      this.validated.delete(role);
      await this.get(role);
    }
  }
}
