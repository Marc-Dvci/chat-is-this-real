import { parseArgs } from 'node:util';
import { purgeOptionsSchema } from '../src/shared/schemas.js';
import { openDatabase } from '../src/store/database.js';
import { ChatStore } from '../src/store/chat-store.js';

function purge(): void {
  const { values } = parseArgs({ options: { user: { type: 'string' } } });
  const options = purgeOptionsSchema.parse(values);
  const db = openDatabase();
  try {
    const chat = new ChatStore(db);
    const users = db.prepare('SELECT DISTINCT user_id FROM messages WHERE user_login=? COLLATE NOCASE').all(options.user);
    for (const user of users) chat.clearUser(String(user.user_id), 'manual-purge', new Date().toISOString(), 'user_request');
    console.info(`Removed stored chat text for ${users.length} matched viewer accounts and cancelled related requests.`);
  } finally { db.close(); }
}

try { purge(); } catch { console.error('Chat purge failed. Supply --user with the viewer login and stop the server if the database is locked.'); process.exitCode = 1; }
