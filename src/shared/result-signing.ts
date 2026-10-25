import { resultSigningKeySchema } from './schemas.js';

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => Uint8Array.from(value.match(/../gu) ?? [], (part) => Number.parseInt(part, 16));
async function key(value: string) { return crypto.subtle.importKey('raw', bytes(resultSigningKeySchema.parse(value)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
function payload(method: string, path: string, time: string, nonce: string, body: string): Uint8Array<ArrayBuffer> { return encoder.encode(`${method}\n${path}\n${time}\n${nonce}\n${body}`); }
export async function signResultRequest(secret: string, method: string, path: string, time: string, nonce: string, body: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), payload(method, path, time, nonce, body))));
}
export async function verifyResultRequest(secret: string, method: string, path: string, time: string, nonce: string, body: string, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/iu.test(signature)) return false;
  return crypto.subtle.verify('HMAC', await key(secret), bytes(signature), payload(method, path, time, nonce, body));
}
export async function publicResultId(secret: string, nonce: string, body: string): Promise<string> {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '', round = 0;
  // A random nonce makes the id unpredictable while retries keep one public address.
  while (id.length < 10) {
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`result-id\n${nonce}\n${round++}\n${body}`)));
    for (const byte of digest) if (byte < 248 && id.length < 10) id += alphabet[byte % 62];
  }
  return id;
}
