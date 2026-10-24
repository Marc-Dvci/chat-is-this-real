import { normalizeText } from '../shared/text-normalize.js';

const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const values = new Map([...small.map((word, value) => [word, value] as const), ...tens.flatMap((word, index) => word ? [[word, index * 10] as const] : [])]);
function words(value: number): string {
  if (value < 20) return small[value] ?? '';
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ''}`;
  if (value < 1000) return `${small[Math.floor(value / 100)]} hundred${value % 100 ? ` ${words(value % 100)}` : ''}`;
  return `${words(Math.floor(value / 1000))} thousand${value % 1000 ? ` ${words(value % 1000)}` : ''}`;
}
export function queryTerms(query: string): string[] {
  const normalized = normalizeText(query);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const output = new Set(tokens);
  for (const token of tokens) if (/^\d{1,4}$/u.test(token)) for (const word of words(Number(token)).split(' ')) if (word) output.add(word);
  let total = 0, group = 0, active = false;
  const flush = () => { if (active && total + group <= 9999) output.add(String(total + group)); total = 0; group = 0; active = false; };
  for (const token of [...tokens, '']) {
    const value = values.get(token);
    if (value !== undefined) { group += value; active = true; }
    else if (token === 'hundred' && active) group = Math.max(1, group) * 100;
    else if (token === 'thousand' && active) { total += Math.max(1, group) * 1000; group = 0; }
    else if (token !== 'and' || !active) flush();
  }
  const stop = new Set(['the', 'a', 'an', 'i', 'we', 'you', 'your', 'it', 'is', 'was', 'were', 'are', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'did', 'do', 'does', 'what', 'which', 'when', 'where', 'that', 'this', 'said', 'say', 'earlier', 'stream']);
  return [...output].filter((term) => !stop.has(term)).slice(0, 80);
}
