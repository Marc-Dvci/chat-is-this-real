import type { DatabaseSync } from 'node:sqlite';
import type { ChatSettings, CheckJob, StoredMessage } from '../shared/schemas.js';
import { ChatStore } from '../store/chat-store.js';
import { RequestStore } from '../store/request-store.js';
import { SettingsStore } from '../store/settings-store.js';
import { PresentationStore } from '../store/presentation-store.js';
import { VoteTally } from '../votes/tally.js';
import { PublicResults, publicText } from './public-result.js';
import type { registerCheckRoutes } from './check-routes.js';

export class PresentationControl {
  readonly presentation: PresentationStore;
  readonly results: PublicResults;
  readonly votes: VoteTally;
  private readonly settings: SettingsStore;
  private readonly chat: ChatStore;
  private readonly requests: RequestStore;
  private active: string | null = null;
  private approved = new Set<string>();
  private readonly unsubscribe: () => void;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(db: DatabaseSync, private readonly control: ReturnType<typeof registerCheckRoutes>) {
    this.settings = new SettingsStore(db); this.chat = new ChatStore(db); this.requests = new RequestStore(db);
    this.presentation = new PresentationStore(db); this.results = new PublicResults(db); this.votes = new VoteTally(db);
    this.unsubscribe = control.service.subscribe((job) => this.changed(job));
    control.session.onMessage((message) => this.observe(message));
    control.session.onRemoval((_ids, scope) => { this.votes.remove(scope); this.removed(); });
    this.timer = setInterval(() => this.tick(), 100); this.timer.unref();
  }
  observe(message: StoredMessage): boolean { return this.active ? this.votes.vote(message) : false; }
  waitingForReview(): boolean { return Boolean(this.active && !this.approved.has(this.active) && this.control.service.store.get(this.active)?.state === 'ready'); }
  private changed(job: CheckJob): void {
    const settings = this.settings.get(), request = job.request_id ? this.requests.get(job.request_id) : undefined;
    const current = this.presentation.get();
    if (job.state === 'queued' && job.kind === 'real' && job.input && settings.overlay_enabled && !this.active &&
      ['hidden', 'message'].includes(current.phase) && (request?.source === 'chat' || request?.source_message_ids.some((id) => current.source_ids.includes(id)))) {
      this.active = job.id; this.presentation.hold(job.id, '');
    }
    if (this.active === job.id) {
      if (['failed', 'not_a_claim', 'dismissed'].includes(job.state) || !job.input) { this.hide(); return; }
      const screening = this.control.service.store.screening(job.id);
      const fact = job.outcome?.type === 'fact' ? job.outcome : undefined;
      if (screening?.sensitive || fact?.sensitive || screening && screening.kind !== 'fact' || job.outcome?.type === 'vod') { this.hide(); return; }
      if (screening?.kind === 'fact' || fact) {
        try {
          this.presentation.hold(job.id, publicText(job.input.claim));
          if (settings.votes_enabled && !this.votes.get(job.id)) this.votes.open(job.id, request?.broadcast_id ?? '', settings.vote_window_s);
        } catch { this.hide(); return; }
      }
      if (job.state === 'ready') this.votes.ready(job.id);
    }
    if (job.state === 'ready' && settings.auto_publish && job.outcome?.type === 'fact' && !job.outcome.sensitive && job.outcome.evidence.length && (!this.active || this.active === job.id)) {
      try { this.show(job, false); } catch { /* An invalid result stays private. */ }
    }
  }
  show(job: CheckJob, confirmed: boolean): void {
    if (!['ready', 'on_air'].includes(job.state) || !job.outcome || job.outcome.failed) throw new Error('Wait for the check to finish.');
    if (job.outcome.type === 'fact' && job.outcome.sensitive && !confirmed) throw new Error('Confirm the sensitive claim before showing it.');
    this.results.project(job);
    const vote = this.active === job.id ? this.votes.get(job.id) : undefined;
    if (vote && !vote.cancelled && vote.closed_ms === null) { this.approved.add(job.id); return; }
    this.reveal(job);
  }
  private reveal(job: CheckJob): void {
    const result = this.results.project(job);
    if (this.active && this.active !== job.id) this.votes.cancel(this.active);
    this.active = null; this.approved.delete(job.id);
    if (result.type === 'fact') this.votes.reveal(job.id, result.verdict);
    this.settings.set({ ...this.settings.get(), overlay_enabled: true });
    this.control.service.store.state(job.id, 'on_air');
    this.presentation.show({ phase: 'reveal', job_id: job.id, message_text: '', source_ids: [] }, this.settings.get().dwell_s);
  }
  private tick(): void {
    this.removed(); if (!this.active) return;
    const job = this.control.service.store.get(this.active), vote = this.votes.get(this.active);
    const request = job?.request_id ? this.requests.get(job.request_id) : undefined;
    if (request?.source === 'chat' && request.broadcast_id !== this.control.session.currentStreamId()) { this.hide(); return; }
    if (job?.state === 'ready' && this.approved.has(job.id) && (!vote || vote.cancelled || vote.closed_ms !== null)) {
      try { this.reveal(job); } catch { this.hide(); }
    }
  }
  hide(): void { if (this.active) this.votes.cancel(this.active); this.active = null; this.approved.clear(); this.presentation.hide(); }
  removed(): void {
    const view = this.presentation.get(), job = view.job_id ? this.control.service.store.get(view.job_id) : undefined;
    if (view.job_id && (!job?.input || ['failed', 'dismissed', 'not_a_claim'].includes(job.state)) || view.source_ids.some((id) => !this.chat.get(id)?.body)) this.hide();
  }
  configure(value: ChatSettings): void {
    if (!value.overlay_enabled) this.hide();
    if (!value.votes_enabled && this.active) this.votes.cancel(this.active);
  }
  purge(userId: string): void { this.votes.remove({ type: 'user', id: userId }); }
  close(): void { clearInterval(this.timer); this.unsubscribe(); this.presentation.close(); }
}
