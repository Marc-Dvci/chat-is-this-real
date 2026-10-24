import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { PassThrough } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const denied = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) denied.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [['2001:db8::', 32], ['2001::', 32], ['2001:10::', 28], ['2001:20::', 28], ['2002::', 16]] as const) {
  denied.addSubnet(address, bits, 'ipv6');
}
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

export function sourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Only public HTTPS source pages are allowed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local source addresses are blocked.');
  }
  if (isIP(host) && !isPublicAddress(host)) throw new Error('Private source addresses are blocked.');
  url.hash = '';
  return url;
}

async function resolveSource(url: URL, signal: AbortSignal) {
  signal.throwIfAborted();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new Error('Source lookup timed out.'));
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    const addresses = await Promise.race([lookup(host, { all: true }), aborted]);
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
      throw new Error('Source DNS includes a private or reserved address.');
    }
    return addresses;
  } finally { if (rejectAbort) signal.removeEventListener('abort', rejectAbort); }
}

export async function downloadSource(value: string, externalSignal?: AbortSignal) {
  const timeout = AbortSignal.timeout(6000);
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
  let url = sourceUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await resolveSource(url, signal);
    const response = await new Promise<{ status: number; location?: string; body: string; contentType: string }>((done, reject) => {
      const outgoing = request(url, {
        signal, method: 'GET', headers: { 'User-Agent': 'ChatIsThisReal/0.1', Accept: 'text/html,application/xhtml+xml,text/plain', 'Accept-Encoding': 'gzip, deflate, br' },
        lookup: (_hostname, options, callback) => {
          const first = addresses[0];
          if (!first) { callback(new Error('No public address found.'), ''); return; }
          callback(null, options.all ? addresses : first.address, first.family);
        }
      }, (incoming) => {
        const status = incoming.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          incoming.destroy();
          done({ status, ...(incoming.headers.location ? { location: incoming.headers.location } : {}), body: '', contentType: '' });
          return;
        }
        const type = incoming.headers['content-type'] ?? '';
        if (status !== 200 || !/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:;|$)/i.test(type)) {
          incoming.destroy();
          done({ status, body: '', contentType: type });
          return;
        }
        const encoding = incoming.headers['content-encoding'];
        const decoded = encoding === 'gzip' ? createGunzip() : encoding === 'br' ? createBrotliDecompress()
          : encoding === 'deflate' ? createInflate() : new PassThrough();
        const chunks: Buffer[] = [];
        let compressed = 0, expanded = 0;
        incoming.on('data', (chunk: Buffer) => {
          compressed += chunk.length;
          if (compressed > 2 * 1024 * 1024) { incoming.destroy(); decoded.destroy(); reject(new Error('Source exceeds the download limit.')); }
        });
        incoming.on('error', reject);
        decoded.on('error', (error) => { incoming.destroy(); reject(error); });
        decoded.on('data', (chunk: Buffer) => {
          expanded += chunk.length;
          if (expanded > 2 * 1024 * 1024) { incoming.destroy(); decoded.destroy(); reject(new Error('Source exceeds the expanded size limit.')); }
          else chunks.push(chunk);
        });
        decoded.on('end', () => done({ status, body: Buffer.concat(chunks).toString('utf8'), contentType: type }));
        incoming.pipe(decoded);
      });
      outgoing.on('error', reject);
      outgoing.end();
    });
    if (response.location) {
      if (redirects === 3) throw new Error('Source exceeded the redirect limit.');
      url = sourceUrl(new URL(response.location, url).href);
      continue;
    }
    return { ...response, url: url.href };
  }
  throw new Error('Source fetch did not complete.');
}
