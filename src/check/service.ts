import type { SqliteStore } from '../store/sqlite.js';
import { CheckStore } from '../store/check-store.js';
import { RequestStore } from '../store/request-store.js';
import { SegmentStore } from '../store/segment-store.js';
import { CheckEngine } from './engine.js';
import { CheckQueue, type CheckReplay } from './queue.js';
import { ModelClient } from '../llm/client.js';
import { loadModelConfig } from '../llm/config.js';
import { VodEngine } from '../vod/engine.js';
import type { CheckJob } from '../shared/schemas.js';
export type { CheckReplay } from './queue.js';

function liveRunner(db: SqliteStore): CheckReplay {
  let engine: CheckEngine | undefined;
  const store = new CheckStore(db), requests = new RequestStore(db);
  return async (job, state, signal) => {
    if (!job.input) throw new Error('The source was removed.');
    const input = job.input, request = job.request_id ? requests.get(job.request_id) : undefined;
    const current = engine ??= new CheckEngine(new ModelClient(loadModelConfig()), {
      get: (key) => store.getCache(key), put: (key, outcome) => store.putCache(key, outcome)
    });
    const vod = () => { state('reading'); return new VodEngine(current.model, new SegmentStore(db)).run(job.id, input.claim, request?.broadcast_id, { signal }); };
    const outcome = job.kind === 'vod' ? await vod() : await current.run(input, { signal, onState: state,
      onTriage: (value) => { store.screened(job.id, value); state(store.get(job.id)?.state ?? 'triage'); } });
    return outcome.type === 'stream_memory' ? vod() : outcome;
  };
}

export class CheckService extends CheckQueue {
  constructor(db: SqliteStore, changed: (job: CheckJob) => void = () => undefined, replay?: CheckReplay) {
    super(db, changed, replay ?? liveRunner(db), Boolean(replay));
  }
}
