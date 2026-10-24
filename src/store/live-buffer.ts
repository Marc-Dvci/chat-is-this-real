import type { RemovalScope, StoredMessage } from '../shared/schemas.js';
import type { ChatStore } from './chat-store.js';

export class LiveBuffer {
  private rows: StoredMessage[] = [];
  put(message: StoredMessage): void { this.rows.push(message); if (this.rows.length > 200) this.rows.shift(); }
  remove(scope: RemovalScope): void {
    this.rows = this.rows.map((message) => (scope.type === 'message' ? message.id === scope.id : scope.type === 'user' ? message.user_id === scope.id : message.broadcast_id === scope.id)
      ? { ...message, body: null, removed_reason: 'moderation' } : message);
  }
  list(chat: ChatStore, stream: string | undefined): StoredMessage[] {
    if (!stream) return [];
    const rows = new Map(chat.list(undefined, stream, '', 200).map((message) => [message.id, message]));
    for (const message of this.rows.filter((item) => item.broadcast_id === stream)) {
      const stored = chat.get(message.id);
      rows.set(message.id, stored?.removed_reason ? stored : chat.suppressed(message) ? { ...message, body: null, removed_reason: 'moderation' } : message);
    }
    return [...rows.values()].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 200);
  }
  clear(): void { this.rows = []; }
}
