import { expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/store/database.js';
import { CheckStore } from '../src/store/check-store.js';

it('refuses changed source bytes and fabricated evidence through the public route and overlay approval', async () => {
  const db = openDatabase(':memory:'), app = buildApp({ db, demo: true });
  try {
    const id = 'demo-check-showcase-fr', original = new CheckStore(db).get(id)?.outcome;
    if (!original || original.type !== 'fact' || !original.sources[0] || !original.evidence[0]) throw new Error('Missing real recorded source result.');
    const headers = { 'x-dashboard-token': (await app.inject('/api/session')).json<{ csrf_token: string }>().csrf_token };
    expect((await app.inject(`/api/results/${id}`)).statusCode).toBe(200);
    const variants = [
      { ...original, sources: original.sources.map((source, index) => index ? source : { ...source, text: `${source.text} Changed bytes.` }) },
      { ...original, evidence: original.evidence.map((item, index) => index ? item : { ...item, excerpt: 'An invented passage says every player receives a flying purple castle.' }) }
    ];
    for (const [index, outcome] of variants.entries()) {
      db.prepare('UPDATE check_jobs SET outcome_json=?, updated_at=? WHERE id=?').run(JSON.stringify(outcome), new Date(Date.now() + (index + 1) * 1000).toISOString(), id);
      expect((await app.inject(`/api/results/${id}`)).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/presentation', headers, payload: { action: 'show_check', id } })).statusCode).toBe(409);
    }
  } finally { await app.close(); db.close(); }
});

it('refuses an invented quote and shifted timestamp through the public VOD route', async () => {
  const db = openDatabase(':memory:'), app = buildApp({ db, demo: true });
  try {
    const id = 'demo-check-showcase-vod', original = new CheckStore(db).get(id)?.outcome;
    if (!original || original.type !== 'vod' || original.offset_s === null) throw new Error('Missing recorded VOD answer.');
    expect((await app.inject(`/api/results/${id}`)).statusCode).toBe(200);
    const variants = [{ ...original, quote: 'A speech segment invented after the real model run.' }, { ...original, offset_s: original.offset_s + 10 }];
    for (const outcome of variants) {
      db.prepare('UPDATE check_jobs SET outcome_json=?, updated_at=? WHERE id=?').run(JSON.stringify(outcome), new Date().toISOString(), id);
      expect((await app.inject(`/api/results/${id}`)).statusCode).toBe(409);
    }
  } finally { await app.close(); db.close(); }
});
