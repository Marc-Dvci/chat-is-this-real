import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { loadTwitchConfig } from '../src/twitch/config.js';
import { createOAuthSetup, testStreamScopes } from '../src/twitch/oauth.js';
import { TwitchTokens } from '../src/twitch/tokens.js';

async function setup(): Promise<void> {
  const config = loadTwitchConfig();
  const { values } = parseArgs({ options: { automation: { type: 'boolean', default: false } } });
  const tokens = await TwitchTokens.open(config);
  const setup = createOAuthSetup(config, (role, code) => tokens.authorize(role, code,
    role === 'broadcaster' && values.automation ? testStreamScopes : []),
  values.automation ? { broadcaster: testStreamScopes } : {});
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    await setup.app.listen({ host: '127.0.0.1', port: 4747 });
    const roles = values.automation ? ['broadcaster'] as const : ['broadcaster', 'bot'] as const;
    for (const role of roles) {
      console.info(`Open the ${role} authorization link in ${role === 'bot' ? 'a private window signed in as the bot' : 'your browser signed in as the broadcaster'}:`);
      console.info(setup.begin(role));
      const deadline = Date.now() + 10 * 60_000;
      while (!setup.connected.has(role) && !cancelled && Date.now() < deadline) await delay(250);
      if (!setup.connected.has(role)) throw new Error('Authorization stopped or expired. Run setup again.');
      console.info(`${role === 'bot' ? 'Bot' : 'Broadcaster'} authorization saved.`);
    }
    await tokens.get('app');
    console.info('Twitch is connected. Credentials are stored locally in data/tokens.json.');
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await setup.app.close();
  }
}

void setup().catch((error: unknown) => {
  console.error(error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Twitch setup could not complete.');
  console.error('Check the four Twitch settings in .env, close the dev server on port 4747, and sign in to the configured accounts.');
  process.exitCode = 1;
});
