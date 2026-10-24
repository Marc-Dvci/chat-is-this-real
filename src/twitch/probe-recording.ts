import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertNoSecretFragments } from '../shared/format-chat.js';
import { eventSubEnvelopeSchema, probeReportSchema, twitchChatEventSchema, type ProbeReport } from '../shared/schemas.js';

export const probeClaim = "The Moon is Earth's natural satellite.";

export class ProbeRecording {
  private bytes = 0;

  constructor(readonly directory: string, private readonly secrets: readonly string[]) {}

  capture(raw: string): void {
    assertNoSecretFragments(raw, this.secrets);
    this.bytes += Buffer.byteLength(raw);
    if (this.bytes > 50 * 1024 * 1024) throw new Error('Probe capture reached its storage limit.');
    appendFileSync(join(this.directory, 'frames.jsonl'), `${raw}\n`, { mode: 0o600 });
  }

  async save(report: ProbeReport): Promise<void> {
    await writeFile(join(this.directory, 'report.json'), JSON.stringify(probeReportSchema.parse(report), null, 2), { mode: 0o600 });
  }
}

export async function exportProbeFixtures(report: ProbeReport, secrets: readonly string[], includeDeletion = false,
  script: { claim: string; command: string; message_ids?: readonly string[] } = { claim: probeClaim, command: '!real' }): Promise<number> {
  const raw = await readFile(join('data/probe', report.run, 'frames.jsonl'), 'utf8');
  if (Buffer.byteLength(raw) > 50 * 1024 * 1024) throw new Error('Probe capture is too large.');
  const users = new Map<string, string>([[report.broadcaster_id, 'demo_streamer'], [report.bot_id, 'demo_bot']]);
  const ids = new Map<string, string>([[report.broadcaster_id, '900001'], [report.bot_id, '900002']]);
  const aliases = new Map<string, string>();

  function discover(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(discover); return; }
    const object = value as Record<string, unknown>;
    for (const [key, entry] of Object.entries(object)) {
      if (key.endsWith('user_id') && typeof entry === 'string' && entry) {
        if (!users.has(entry)) users.set(entry, `demo_viewer_${users.size - 1}`);
        if (!ids.has(entry)) ids.set(entry, String(900001 + ids.size));
        const prefix = key.slice(0, -2);
        for (const suffix of ['login', 'name']) {
          const name = object[`${prefix}${suffix}`];
          if (typeof name === 'string' && name) aliases.set(name, users.get(entry) ?? 'demo_viewer');
        }
      }
      discover(entry);
    }
  }

  function scrub(value: unknown, key = '', parent = ''): unknown {
    if (Array.isArray(value)) return value.map((entry) => scrub(entry, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, scrub(entry, field, key)]));
    }
    if (typeof value !== 'string') return value;
    // Badge set names and versions carry permission semantics rather than account identity.
    if ((parent === 'badges' || parent === 'source_badges') && (key === 'set_id' || key === 'id')) return value;
    if ((key === 'id' || key.endsWith('_id')) && value) {
      return ids.get(value) ?? `recorded-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
    }
    if ((key === 'reconnect_url' || key === 'recovery_url') && value) return 'wss://eventsub.wss.twitch.tv/ws?session=recorded';
    if (key.endsWith('user_login') || key.endsWith('user_name')) return aliases.get(value) ?? 'demo_viewer';
    if (key === 'text' || key.endsWith('_message_body')) {
      let cleaned = value;
      for (const [name, alias] of [...aliases].sort((a, b) => b[0].length - a[0].length)) cleaned = cleaned.replaceAll(`@${name}`, `@${alias}`);
      return cleaned;
    }
    return value;
  }

  const selected = [];
  const scriptedIds = new Set<string>();
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const frame = eventSubEnvelopeSchema.parse(JSON.parse(line));
    if (frame.metadata.message_type === 'notification') {
      if (frame.payload.subscription?.type === 'channel.chat.message') {
        const event = twitchChatEventSchema.parse(frame.payload.event);
        const text = event.message.text.replace(/^(?:@\S+\s+)*/u, '').trim();
        if (text !== script.claim && !(text === script.command && event.reply?.parent_message_body === script.claim) && !script.message_ids?.includes(event.message_id)) continue;
        scriptedIds.add(event.message_id);
      } else if (!(includeDeletion && frame.payload.subscription?.type === 'channel.chat.message_delete'
        && typeof frame.payload.event?.message_id === 'string' && scriptedIds.has(frame.payload.event.message_id))) continue;
    }
    discover(frame);
    selected.push(frame);
  }
  if (!selected.some((frame) => frame.payload.event && twitchChatEventSchema.safeParse(frame.payload.event).data?.reply)) {
    throw new Error('Record the scripted reply before exporting fixtures.');
  }
  const serialized = selected.map((frame) => JSON.stringify(scrub(frame))).join('\n') + '\n';
  assertNoSecretFragments(serialized, secrets);
  await mkdir('fixtures/twitch', { recursive: true });
  await writeFile(join('fixtures/twitch', `probe-${report.run}.jsonl`), serialized);
  return selected.length;
}
