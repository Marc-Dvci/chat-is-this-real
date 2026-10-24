export function normalizeUntrimmed(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[‘’‚‛]/gu, "'").replace(/[“”„‟]/gu, '"')
    .replace(/[‐‑‒–—―−]/gu, '-').replace(/\s+/gu, ' ');
}

export function normalizeText(value: string): string { return normalizeUntrimmed(value).trim(); }
