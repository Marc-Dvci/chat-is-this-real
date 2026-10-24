export function loadedSecrets(extra: readonly string[] = []): string[] {
  return [...new Set([...Object.entries(process.env).flatMap(([name, value]) =>
    /secret|token|password|api_key|signing_key/iu.test(name) && value ? [value] : []), ...extra])];
}
