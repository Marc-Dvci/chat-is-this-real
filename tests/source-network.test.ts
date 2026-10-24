import { describe, expect, it } from 'vitest';
import { isPublicAddress, sourceUrl } from '../src/check/source-network.js';

describe('source network boundary', () => {
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1'])('blocks reserved address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(['http://example.com', 'https://localhost/', 'https://127.1/', 'https://2130706433/', 'https://[::1]/', 'https://example.com:8443/', 'https://user:password@example.com/'])('blocks unsafe source URL %s', (url) => {
    expect(() => sourceUrl(url)).toThrow();
  });
  it('accepts public HTTPS sources and removes fragments', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(sourceUrl('https://science.nasa.gov/moon/facts/#rings').href).toBe('https://science.nasa.gov/moon/facts/');
  });
});
