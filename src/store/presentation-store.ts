import type { SqliteStore } from './sqlite.js';
import { presentationSchema, type Presentation } from '../shared/schemas.js';

export class PresentationStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly db: SqliteStore) { this.hide(); }
  get(): Presentation {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key='presentation'").get();
    return presentationSchema.parse(row ? JSON.parse(String(row.value_json)) : { phase: 'hidden', job_id: null, message_text: '', source_ids: [], updated_at: new Date().toISOString(), hide_at: null });
  }
  show(value: Pick<Presentation, 'phase' | 'job_id' | 'message_text' | 'source_ids'>, dwell: number): void {
    clearTimeout(this.timer);
    const now = Date.now();
    const reveal = value.phase === 'reveal' ? 600 : 0;
    this.save({ ...value, updated_at: new Date(now).toISOString(), hide_at: new Date(now + reveal + dwell * 1000 + 300).toISOString() });
    const exit = () => { this.phase('exit'); this.after(300, () => this.hide()); };
    if (reveal) this.after(reveal, () => { this.phase('dwell'); this.after(dwell * 1000, exit); });
    else this.after(dwell * 1000, exit);
  }
  hold(jobId: string, text: string): void {
    clearTimeout(this.timer);
    const current = this.get();
    if (current.phase === 'checking' && current.job_id === jobId && current.message_text === text) return;
    this.save({ phase: 'checking', job_id: jobId, message_text: text, source_ids: [], updated_at: new Date().toISOString(), hide_at: null });
  }
  private phase(phase: Presentation['phase']): void { this.save({ ...this.get(), phase, updated_at: new Date().toISOString() }); }
  private after(milliseconds: number, run: () => void): void { this.timer = setTimeout(run, milliseconds); this.timer.unref?.(); }
  hide(): void {
    clearTimeout(this.timer); this.timer = undefined;
    this.save({ phase: 'hidden', job_id: null, message_text: '', source_ids: [], updated_at: new Date().toISOString(), hide_at: null });
  }
  private save(value: Presentation): void { this.db.prepare("INSERT INTO settings VALUES('presentation',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(presentationSchema.parse(value))); }
  close(): void { clearTimeout(this.timer); }
}
