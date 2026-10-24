import { expect, it } from 'vitest';
import { openDatabase } from '../src/store/database.js';
import { CheckStore } from '../src/store/check-store.js';
import { VoteTally } from '../src/votes/tally.js';
import type { StoredMessage } from '../src/shared/schemas.js';

function setup() {
  const db = openDatabase(':memory:'), checks = new CheckStore(db);
  for (const id of ['vote-round-a', 'vote-round-b']) checks.create({ id, claim: 'The Sun is a star.', context: [], channel: { title: '', category: '', language: 'en' } });
  let now = 1000, sequence = 0;
  const tally = new VoteTally(db, () => now);
  const message = (user: string, body: string, broadcast = 'vote-stream'): StoredMessage => ({ id: `domain-vote-${++sequence}`, user_id: user, user_login: 'demo_viewer', display_name: 'demo_viewer', broadcast_id: broadcast,
    body, badges: [], created_at: new Date(now).toISOString(), scope: 'history', removed_reason: null, parent_id: null });
  return { db, tally, message, time: (value: number) => { now = value; } };
}
it('counts the first exact vote, rejects duplicates, non-votes, another stream and the closing boundary', () => {
  const { db, tally, message, time } = setup();
  try {
    tally.open('vote-round-a', 'vote-stream', 20);
    expect(tally.vote(message('viewer-a', ' 1 '))).toBe(true);
    expect(tally.vote(message('viewer-a', '2'))).toBe(false);
    expect(tally.vote(message('viewer-b', '1 Pog'))).toBe(false);
    expect(tally.vote(message('viewer-b', '2', 'other-stream'))).toBe(false);
    tally.ready('vote-round-a'); time(20_999); expect(tally.vote(message('viewer-b', '2'))).toBe(true);
    time(21_000); expect(tally.vote(message('viewer-c', '1'))).toBe(false);
    expect(tally.view('vote-round-a')).toMatchObject({ real: 1, not_real: 1, closed: true, revealed: false });
    expect(tally.scores('vote-stream')).toEqual([]);
    tally.reveal('vote-round-a', 'real'); tally.reveal('vote-round-a', 'real');
    expect(tally.scores('vote-stream')).toEqual([{ user_id: 'viewer-a', points: 1 }]);
  } finally { db.close(); }
});
it('holds fast results for twenty seconds and closes slow results at sixty seconds', () => {
  const { db, tally, time, message } = setup();
  try {
    tally.open('vote-round-a', 'vote-stream', 1); tally.ready('vote-round-a'); time(20_999);
    expect(tally.get('vote-round-a')?.closed_ms).toBeNull();
    tally.reveal('vote-round-a', 'real'); expect(tally.get('vote-round-a')?.revealed_verdict).toBeNull();
    time(21_000); expect(tally.get('vote-round-a')?.closed_ms).toBe(21_000);
    tally.open('vote-round-b', 'vote-stream', 100); time(80_999); expect(tally.vote(message('viewer-a', '1'))).toBe(true);
    time(81_000); expect(tally.vote(message('viewer-b', '2'))).toBe(false);
    tally.ready('vote-round-b'); expect(tally.get('vote-round-b')?.closed_ms).toBe(81_000);
  } finally { db.close(); }
});
it('awards no points for qualified results or a cancelled round and removes purged votes', () => {
  const { db, tally, message, time } = setup();
  try {
    tally.open('vote-round-a', 'vote-stream', 20); tally.vote(message('viewer-a', '1')); tally.ready('vote-round-a'); time(21_000); tally.reveal('vote-round-a', 'missing_context');
    expect(tally.view('vote-round-a')?.no_call).toBe(true); expect(tally.scores('vote-stream')).toEqual([]);
    tally.open('vote-round-b', 'vote-stream', 20); tally.vote(message('viewer-a', '2')); tally.cancel('vote-round-b'); time(81_000); tally.reveal('vote-round-b', 'not_real');
    expect(tally.scores('vote-stream')).toEqual([]); expect(tally.view('vote-round-b')).toBeNull();
    tally.remove({ type: 'user', id: 'viewer-a' }); expect(tally.view('vote-round-a')?.real).toBe(0);
  } finally { db.close(); }
});
it('cancels unfinished rounds after a restart and preserves previously awarded points', () => {
  const { db, tally, message, time } = setup();
  try {
    tally.open('vote-round-a', 'vote-stream', 20); tally.vote(message('viewer-a', '1')); tally.ready('vote-round-a'); time(21_000); tally.reveal('vote-round-a', 'real');
    tally.open('vote-round-b', 'vote-stream', 20); tally.vote(message('viewer-b', '2'));
    const resumed = new VoteTally(db, () => 81_000); resumed.reveal('vote-round-b', 'not_real');
    expect(resumed.get('vote-round-b')?.cancelled).toBe(true);
    expect(resumed.scores('vote-stream')).toEqual([{ user_id: 'viewer-a', points: 1 }]);
  } finally { db.close(); }
});
