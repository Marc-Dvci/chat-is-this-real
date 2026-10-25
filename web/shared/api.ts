import type { z } from 'zod';
import { dashboardSessionSchema } from '../../src/shared/schemas.js';
import { staticDemo } from './paths.js';

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return staticDemo() ? (await import('../demo/client.js')).demoFetch(path, init) : fetch(path, init);
}

let token: Promise<string> | undefined;
export async function readApi<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(path, { ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(await errorText(response));
  return schema.parse(await response.json());
}
async function errorText(response: Response): Promise<string> {
  try { const body: unknown = await response.json(); if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error; } catch { /* Use the bounded fallback below. */ }
  return 'The request could not finish. Try again.';
}
export async function mutate(path: string, body: unknown = {}, method = 'POST'): Promise<unknown> {
  token ??= readApi('/api/session', dashboardSessionSchema).then((session) => session.csrf_token);
  const response = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json', 'x-dashboard-token': await token }, body: JSON.stringify(body) });
  if (!response.ok) { if (response.status === 403) token = undefined; throw new Error(await errorText(response)); }
  return response.json();
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The request could not finish.'; }
export async function copyText(value: string): Promise<void> { await navigator.clipboard.writeText(value); }
export async function uploadMedia(path: string, file: File): Promise<unknown> {
  token ??= readApi('/api/session', dashboardSessionSchema).then((session) => session.csrf_token);
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-dashboard-token': await token }, body: file });
  if (!response.ok) throw new Error(await errorText(response)); return response.json();
}
