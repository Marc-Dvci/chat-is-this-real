const registered = new Set<string>();
export function registerSecrets(values: readonly string[]): void {
  for (const value of values) if (value.length >= 12) registered.add(value);
}
export function loadedSecrets(extra: readonly string[] = []): string[] {
  return [...new Set([...Object.entries(process.env).flatMap(([name, value]) =>
    /secret|token|password|api_key|signing_key/iu.test(name) && value ? [value] : []), ...registered, ...extra])];
}
