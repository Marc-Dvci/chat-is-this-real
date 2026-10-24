import { describe, expect, it } from 'vitest';
import { formatChat } from '../src/shared/format-chat.js';

describe('publication boundary', () => {
  it('blocks commands and neutralizes mentions', () => {
    expect(() => formatChat('  /ban viewer')).toThrow();
    expect(() => formatChat(' .timeout viewer')).toThrow();
    expect(formatChat('Hello @viewer\nfrom chat')).toBe('Hello ＠viewer from chat');
  });

  it('limits the actual UTF-16 message without splitting a surrogate pair', () => {
    const message = formatChat(`${'x'.repeat(499)}🛰️`);
    expect(message.length).toBeLessThanOrEqual(500);
    expect(message).toBe('x'.repeat(499));
  });

  it('blocks a secret fragment even when it would have been truncated or altered', () => {
    const secret = 'local-placeholder@credential-value';
    expect(() => formatChat(`Message ${secret.slice(3, 15)}`, [secret])).toThrow('secret fragment');
    expect(() => formatChat(`${'x'.repeat(510)} ${secret}`, [secret])).toThrow('secret fragment');
    expect(() => formatChat(`Message ${secret}`, [secret])).toThrow('secret fragment');
  });
});
