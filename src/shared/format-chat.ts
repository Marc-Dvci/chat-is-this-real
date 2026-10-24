import { loadedSecrets } from './secrets.js';

export function assertNoSecretFragments(text: string, secrets: readonly string[]): void {
  for (const secret of secrets) {
    if (secret.length < 12) continue;
    for (let offset = 0; offset <= secret.length - 12; offset++) {
      if (text.includes(secret.slice(offset, offset + 12))) {
        throw new Error('Publication blocked: the message contains a secret fragment.');
      }
    }
  }
}
export function formatChat(text: string, secrets: readonly string[] = []): string {
  const allSecrets = loadedSecrets(secrets);
  assertNoSecretFragments(text, allSecrets);
  const clean = text.trim().replaceAll('@', '＠').replace(/[\r\n\t]+/g, ' ');
  if (!clean || /^[/.]/.test(clean)) throw new Error('Publication blocked: invalid chat message.');
  const result = clean.slice(0, 500).replace(/[\uD800-\uDBFF]$/u, '');
  assertNoSecretFragments(result, allSecrets);
  return result;
}
