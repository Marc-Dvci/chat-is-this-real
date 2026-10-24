import type { ChatSettings } from '../shared/schemas.js';

export function parseChatCommand(text: string, names: Pick<ChatSettings, 'real_command' | 'vod_command'>): { kind: 'real' | 'vod'; argument: string } | undefined {
  let value = text.trim();
  for (;;) {
    const mention = /^@[a-z0-9_]{1,25}[,:]?\s+/iu.exec(value);
    if (!mention) break;
    value = value.slice(mention[0].length).trimStart();
  }
  const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(value);
  const command = match?.[1]?.toLowerCase();
  const kind = command === names.real_command ? 'real' : command === names.vod_command ? 'vod' : undefined;
  return kind ? { kind, argument: match?.[2]?.trim() ?? '' } : undefined;
}

export function commandPermission(userId: string, broadcasterId: string, badges: readonly { set_id: string; id: string }[], permission: ChatSettings['permission']) {
  const privileged = userId === broadcasterId || badges.some((badge) => badge.set_id === 'moderator' && badge.id === '1');
  return { privileged, allowed: privileged || permission === 'everyone' || (permission === 'vips' && badges.some((badge) => badge.set_id === 'vip' && badge.id === '1')) };
}

export class CommandCooldown {
  private readonly entries = new Map<string, number>();
  allows(userId: string, privileged: boolean, now: number): boolean {
    for (const [id, expiry] of this.entries) if (expiry <= now) this.entries.delete(id);
    return privileged || ((this.entries.get(userId) ?? 0) <= now && (this.entries.has(userId) || this.entries.size < 10_000));
  }
  consume(userId: string, privileged: boolean, now: number, seconds: number): void {
    if (!privileged) this.entries.set(userId, now + seconds * 1000);
  }
}
