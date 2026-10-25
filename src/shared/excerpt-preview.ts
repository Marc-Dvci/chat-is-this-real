export function excerptPreview(text: string, maximumWords = 25): string {
  const words = [...text.matchAll(/\S+/gu)];
  if (words.length <= maximumWords) return text;
  const end = words[maximumWords]?.index ?? text.length, prefix = text.slice(0, end).trimEnd();
  const breaks = [...prefix.matchAll(/[.!?](?=\s|$)|\s[–—]\s/gu)].map((match) => match.index + (/^[.!?]$/u.test(match[0]) ? 1 : 0));
  const boundary = breaks.filter((index) => text.slice(0, index).trim().split(/\s+/u).length >= 8).at(-1);
  return boundary ? text.slice(0, boundary).trimEnd() : prefix;
}
