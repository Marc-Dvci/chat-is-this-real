import type { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { CheckStore } from '../store/check-store.js';
import { SettingsStore } from '../store/settings-store.js';
import { SegmentStore } from '../store/segment-store.js';
import { chatSettingsSchema, type DemoCatalog, type StoredMessage } from '../shared/schemas.js';
import { recordedDemoOutcome } from './replay.js';

export function seedDemo(db: DatabaseSync, catalog: DemoCatalog): void {
  const chat = new ChatStore(db), requests = new RequestStore(db), checks = new CheckStore(db), segments = new SegmentStore(db);
  new SettingsStore(db).set(chatSettingsSchema.parse({ history_enabled: true, overlay_enabled: true }));
  const ordered = [...catalog.cases].sort((left, right) => (left.key === 'claim-029' ? -1 : right.key === 'claim-029' ? 1 : 0));
  ordered.forEach((item, index) => {
    const created = new Date(Date.now() - index * 45_000).toISOString(), user = index % 3 + 1;
    const message: StoredMessage = { id: `demo-message-${item.key}`, broadcast_id: 'demo-stream', user_id: `demo-user-${user}`,
      user_login: `demo_viewer_${user}`, display_name: `demo_viewer_${user}`, body: item.text, badges: user === 2 ? [{ set_id: 'moderator', id: '1', info: '' }] : [],
      parent_id: null, created_at: created, scope: 'history', removed_reason: null };
    chat.put(message);
    const id = `demo-check-${item.key}`;
    requests.put({ id, kind: item.kind, body: item.text, broadcast_id: 'demo-stream', author_user_id: message.user_id,
      original_message_id: message.id, command_message_id: `demo-command-${item.key}`, context_ids: [], source_message_ids: [message.id], created_at: created, state: 'queued', source: 'dashboard' });
    checks.create({ id, claim: item.text, context: [], channel: { title: 'Recorded development stream', category: 'Just Chatting', language: 'en' } }, id, item.kind);
    checks.finish(id, recordedDemoOutcome(catalog, item, id));
    db.prepare('UPDATE check_jobs SET created_at=?,updated_at=? WHERE id=?').run(created, created, id);
  });
  const sun = ordered.find((item) => item.key === 'claim-029');
  if (sun) {
    const words = sun.text.split(' ');
    [words.slice(0, 4).join(' '), words.slice(4).join(' ')].forEach((body, index) => chat.put({
      id: `demo-split-${index}`, broadcast_id: 'demo-stream', user_id: 'demo-user-1', user_login: 'demo_viewer_1', display_name: 'demo_viewer_1', body,
      badges: [], parent_id: null, created_at: new Date(Date.now() - 600_000 + index * 1000).toISOString(), scope: 'history', removed_reason: null
    }));
  }
  for (const broadcast of catalog.broadcasts) segments.register(broadcast);
  for (const segment of catalog.segments) segments.put(segment);
  for (const coverage of catalog.coverage) segments.cover(coverage.broadcast_id, coverage.start_s, coverage.end_s);
}
