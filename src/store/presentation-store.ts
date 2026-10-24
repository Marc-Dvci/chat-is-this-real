import type { DatabaseSync } from 'node:sqlite';
import { presentationSchema, type Presentation } from '../shared/schemas.js';

export class PresentationStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly db: DatabaseSync) { this.hide(); }
  get(): Presentation {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key='presentation'").get();
    return presentationSchema.parse(row ? JSON.parse(String(row.value_json)) : { phase: 'hidden', job_id: null, message_text: '', source_ids: [], updated_at: new Date().toISOString(), hide_at: null });
  }
  show(value: Pick<Presentation, 'phase' | 'job_id' | 'message_text' | 'source_ids'>, dwell: number): void {
    clearTimeout(this.timer);
    const now = Date.now();
    this.save({ ...value, updated_at: new Date(now).toISOString(), hide_at: new Date(now + dwell * 1000).toISOString() });
    this.timer = setTimeout(() => this.hide(), dwell * 1000); this.timer.unref();
  }
  hide(): void {
    clearTimeout(this.timer); this.timer = undefined;
    this.save({ phase: 'hidden', job_id: null, message_text: '', source_ids: [], updated_at: new Date().toISOString(), hide_at: null });
  }
  private save(value: Presentation): void { this.db.prepare("INSERT INTO settings VALUES('presentation',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(presentationSchema.parse(value))); }
  close(): void { clearTimeout(this.timer); }
}
