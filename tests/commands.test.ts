import { expect, it } from 'vitest';
import { CommandCooldown, commandPermission, parseChatCommand } from '../src/twitch/commands.js';
import { chatSettingsSchema } from '../src/shared/schemas.js';

const names = chatSettingsSchema.parse({});
it.each([
  ['@demo_bot !real', 'real', ''], ['@demo_bot @demo_viewer:   !VOD   where is the blue robot?', 'vod', 'where is the blue robot?'],
  ['  !real   The Moon has no rings.  ', 'real', 'The Moon has no rings.'], ['!real\u00a0A café puzzle 🛰️', 'real', 'A café puzzle 🛰️']
])('parses leading commands in %s', (text, kind, argument) => {
  expect(parseChatCommand(text, names)).toEqual({ kind, argument });
});
it.each(['please !real this', 'a mention @demo_bot !real', '!really no', '/!real claim', '@demo_bot!real claim'])('ignores embedded or unrelated text: %s', (text) => {
  expect(parseChatCommand(text, names)).toBeUndefined();
});
it('enforces roles using broadcaster identity and local badges', () => {
  expect(commandPermission('viewer', 'broadcaster', [], 'moderators').allowed).toBe(false);
  expect(commandPermission('broadcaster', 'broadcaster', [], 'moderators').privileged).toBe(true);
  expect(commandPermission('moderator', 'broadcaster', [{ set_id: 'moderator', id: '1' }], 'moderators').allowed).toBe(true);
  expect(commandPermission('vip', 'broadcaster', [{ set_id: 'vip', id: '1' }], 'vips').allowed).toBe(true);
  expect(commandPermission('vip', 'broadcaster', [{ set_id: 'vip', id: '1' }], 'moderators').allowed).toBe(false);
});

it('keeps per-user cooldowns independent and lets a promoted moderator bypass the remaining delay', () => {
  const gate = new CommandCooldown();
  gate.consume('viewer-a', false, 1000, 60);
  expect(gate.allows('viewer-a', false, 60_999)).toBe(false);
  expect(gate.allows('viewer-b', false, 2000)).toBe(true);
  expect(gate.allows('viewer-a', true, 2000)).toBe(true);
  expect(gate.allows('viewer-a', false, 61_000)).toBe(true);
});
