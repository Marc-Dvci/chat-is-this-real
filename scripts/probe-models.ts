import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { fetchSource } from '../src/check/fetch-source.js';
import { sourceWindow, verifyEvidence } from '../src/check/verify.js';
import { ModelClient, ModelProviderError } from '../src/llm/client.js';
import { loadModelConfig } from '../src/llm/config.js';
import { judgeInstructions, triageInstructions, vodInstructions } from '../src/llm/prompts.js';
import { selectSearchSources } from '../src/llm/search-sources.js';
import { normalizeText } from '../src/shared/text-normalize.js';
import { summarizeProbe } from './probe-summary.js';
import {
  availabilitySchema, judgeSchema, modelProbeOptionsSchema, modelProbeRowSchema, probeClaimsSchema,
  testStreamOutlineSchema, triageSchema, vodProposalSchema,
  type ModelProbeRow, type ModelUsage, type SourceDocument, type Triage
} from '../src/shared/schemas.js';

const execute = promisify(execFile);
const candidates = {
  triage: ['qwen3.8-flash', 'qwen3.7-flash'], search: ['qwen3.8-flash', 'qwen3.7-plus'],
  judge: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max'], vod: ['qwen3.8-flash', 'qwen3.7-plus']
};

function estimatedCost(calls: readonly ModelUsage[]): number {
  const prices: Record<string, readonly [number, number]> = {
    'qwen3.8-flash': [0.15, 0.47], 'qwen3.7-flash': [0.03, 0.13],
    'qwen3.7-plus': [0.4, 1.6], 'qwen3.8-max': [2, 6], 'qwen-audio-3.1-asr-flash': [0.15, 0.47]
  };
  return calls.reduce((total, call) => {
    const price = prices[call.model] ?? [2, 6];
    const unknownUsage = call.status === 'error' && call.input_tokens === 0 && call.output_tokens === 0 && ['timeout', 'request_failed', 'http_error', 'schema_validation', 'empty_response', 'search_response_schema', 'asr_response_schema', 'incomplete_search'].includes(call.error_code ?? '');
    return total + (unknownUsage ? 0.25 : 0) + call.search_calls * 0.01 + (call.input_tokens * price[0] + call.output_tokens * price[1]) / 1_000_000;
  }, 0);
}

function wordErrors(reference: string, actual: string) {
  const words = (text: string) => normalizeText(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u).filter(Boolean);
  const expected = words(reference), found = words(actual);
  let previous = Array.from({ length: found.length + 1 }, (_entry, index) => index);
  for (const [row, word] of expected.entries()) {
    const next = [row + 1];
    for (let column = 0; column < found.length; column++) next.push(Math.min(
      (next[column] ?? 0) + 1, (previous[column + 1] ?? 0) + 1, (previous[column] ?? 0) + (word === found[column] ? 0 : 1)
    ));
    previous = next;
  }
  return { word_errors: previous[found.length] ?? expected.length, reference_words: expected.length };
}

async function probe(): Promise<void> {
  const { values } = parseArgs({ options: { live: { type: 'boolean', default: false }, 'budget-usd': { type: 'string', default: '1' },
    'search-mode': { type: 'string', default: 'reference' } } });
  const options = modelProbeOptionsSchema.parse({ live: values.live, budget_usd: Number(values['budget-usd']), search_mode: values['search-mode'] });
  const config = loadModelConfig();
  const claims = probeClaimsSchema.parse(JSON.parse(await readFile('scripts/probe-claims.json', 'utf8')));
  const outline = testStreamOutlineSchema.parse(JSON.parse(await readFile('scripts/test-stream-outline.json', 'utf8')));
  for (const id of [0, 2, 4]) {
    const info = await execute('ffprobe.exe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', `data/test-stream/speech-${id}.wav`], { windowsHide: true });
    if (Number(info.stdout.trim()) > 15) throw new Error('A speech reference exceeds the complete 15-second chunk.');
  }
  if (!options.live) {
    console.info(JSON.stringify({ mode: 'preview', endpoint: new URL(config.MODELSTUDIO_BASE_URL).hostname, candidates,
      probe_claims: claims.length, search_mode: options.search_mode,
      planned_search_calls: options.search_mode === 'provider' ? claims.filter((claim) => claim.expected_verdict).length * candidates.search.length : 0,
      speech_source: 'original prerecorded test, system speech', budget_usd: options.budget_usd,
      instruction: 'Use LIVE=1 and --live only after approving provider usage. This is a probe set, separate from the locked dev and heldout evaluations.' }, null, 2));
    return;
  }
  if (process.env.LIVE !== '1') throw new Error('Set LIVE=1 explicitly for live provider calls.');
  const gitCommit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const workingTreeDirty = Boolean((await execute('git', ['status', '--porcelain'])).stdout.trim());
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join('data/probe-models', runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const client = new ModelClient(config, join(directory, 'wire'));
  const rows: ModelProbeRow[] = [];
  const baselineLatency: number[] = [];
  const available = new Set<string>();
  const roleTimes = new Map<string, number>();
  const reportPath = join('eval/results', `models-probe-${runId}.json`);
  const checkBudget = () => {
    if (estimatedCost(client.calls) + 0.25 > options.budget_usd) throw new Error('The probe reached its conservative usage budget.');
    for (const model of new Set(client.calls.map((call) => call.model))) {
      const used = client.calls.filter((call) => call.model === model).reduce((sum, call) => sum + call.input_tokens + call.output_tokens, 0);
      if (used >= 100_000) throw new Error('The probe reached its per-model token limit.');
    }
  };

  async function measure<T>(id: string, role: ModelProbeRow['role'], model: string, operation: () => Promise<T>, details: (value: T) => Partial<ModelProbeRow> = () => ({})): Promise<T | undefined> {
    checkBudget();
    const started = performance.now();
    try {
      const value = await operation();
      const elapsed = performance.now() - started;
      roleTimes.set(`${id}:${role}:${model}`, elapsed);
      rows.push(modelProbeRowSchema.parse({ id, role, model, status: 'ok', elapsed_ms: elapsed, ...details(value) }));
      console.info(`${role}: ${id} / ${model} completed.`);
      return value;
    } catch (error) {
      const reason = error instanceof ModelProviderError ? error.reason : 'request_failed';
      rows.push(modelProbeRowSchema.parse({ id, role, model, status: 'error', elapsed_ms: performance.now() - started, error: reason }));
      console.info(`${role}: ${id} / ${model} ended with ${reason}.`);
      if (error instanceof ModelProviderError && (error.reason === 'quota' || error.code === 'search_budget_limit')) throw error;
      return undefined;
    }
  }

  try {
    for (const model of new Set(Object.values(candidates).flat())) {
      if (await measure('availability', 'availability', model, () => client.structured('availability', model, availabilitySchema, 'Return the JSON object {"ok":true}.', { test: 'availability' }))) available.add(model);
    }
    for (const claim of claims) {
      let triage: Triage | undefined;
      let triageModel: string | undefined;
      for (const model of candidates.triage.filter((candidate) => available.has(candidate))) {
        const result = await measure(claim.id, 'triage', model, () => client.structured('triage', model, triageSchema, triageInstructions, {
          claim: claim.message, viewer_context_only: [], channel: { category: 'Just Chatting', title: 'Prerecorded development test', language: 'en' }, date: new Date().toISOString().slice(0, 10)
        }), (result) => ({ expected_kind: claim.expected_kind, kind: result.kind, checkable: result.checkable }));
        if (result && (model === config.MODEL_TRIAGE || !triage)) { triage = result; triageModel = model; }
      }
      if (!triage?.checkable || triage.kind !== 'fact') {
        if (claim.expected_verdict) for (const model of candidates.judge.filter((candidate) => available.has(candidate))) {
          rows.push(modelProbeRowSchema.parse({ id: claim.id, role: 'judge', model, status: 'skipped', elapsed_ms: 0,
            expected_verdict: claim.expected_verdict, skipped_reason: 'triage_not_checkable' }));
        }
        continue;
      }
      let sources: SourceDocument[] = [];
      let baselineSearch = 0;
      let searchModel: string | undefined;
      if (options.search_mode === 'reference' && claim.reference_url) {
        const source = await fetchSource(claim.reference_url, `${claim.id}-reference`);
        sources = source.text ? [source] : [];
        await writeFile(join(directory, `${claim.id}-reference-sources.json`), JSON.stringify([source]), { mode: 0o600 });
      }
      for (const model of options.search_mode === 'provider' ? candidates.search.filter((candidate) => available.has(candidate)) : []) {
        const searchStarted = performance.now();
        const result = await measure(claim.id, 'search', model, () => client.search(model, { claim: triage?.normalized_claim, queries: triage?.search_queries, date: new Date().toISOString().slice(0, 10) }), (result) => ({ source_count: selectSearchSources(result.sources).length }));
        if (!result) continue;
        if (result.searchCalls > 1) throw new ModelProviderError('provider', 'search_budget_limit');
        const selected = selectSearchSources(result.sources);
        const fetchStarted = performance.now();
        const fetched = await Promise.all(selected.map((source, index) => fetchSource(source.url, `${claim.id}-source-${index}`)));
        const searchRow = rows.at(-1);
        if (searchRow?.role === 'search' && searchRow.model === model) {
          searchRow.source_fetch_ms = performance.now() - fetchStarted;
          searchRow.source_count = fetched.filter((source) => source.text).length;
        }
        await writeFile(join(directory, `${claim.id}-${model}-sources.json`), JSON.stringify(fetched), { mode: 0o600 });
        if (model === config.MODEL_SEARCH || !sources.length) {
          sources = fetched.filter((source) => source.text);
          baselineSearch = performance.now() - searchStarted;
          searchModel = model;
        }
      }
      if (!sources.length) {
        for (const model of candidates.judge.filter((candidate) => available.has(candidate))) {
          rows.push(modelProbeRowSchema.parse({ id: claim.id, role: 'judge', model, status: 'skipped', elapsed_ms: 0,
            expected_verdict: claim.expected_verdict, skipped_reason: 'no_sources' }));
        }
        continue;
      }
      for (const model of candidates.judge.filter((candidate) => available.has(candidate))) {
        const judgment = await measure(claim.id, 'judge', model, () => client.structured('judge', model, judgeSchema, judgeInstructions, {
          claim: triage?.normalized_claim,
          sources: sources.map((source) => ({ source_id: source.id, url: source.url, tier: source.tier, fetched_at: source.fetched_at,
            text: sourceWindow(source.text, [triage?.normalized_claim ?? '', ...triage?.search_queries ?? []]) }))
        }), (result) => ({ expected_verdict: claim.expected_verdict, verdict: result.verdict, returned_excerpts: result.evidence.length, verified_excerpts: verifyEvidence(result.evidence, sources).verified.length }));
        if (judgment && sources.length && model === config.MODEL_JUDGE && triageModel === config.MODEL_TRIAGE && searchModel === config.MODEL_SEARCH) baselineLatency.push(
          (roleTimes.get(`${claim.id}:triage:${config.MODEL_TRIAGE}`) ?? 0) + baselineSearch + (roleTimes.get(`${claim.id}:judge:${model}`) ?? 0)
        );
      }
    }
    const segments: { id: string; offset_s: number; text: string }[] = [];
    let previous = '';
    for (const id of [0, 2, 4]) {
      const paragraph = outline.find((item) => item.id === id);
      if (!paragraph) throw new Error('Missing speech reference.');
      const info = await execute('ffprobe.exe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', `data/test-stream/speech-${id}.wav`], { windowsHide: true });
      if (Number(info.stdout.trim()) > 15) throw new Error('A speech reference exceeds the complete 15-second chunk. Choose a fully contained reference.');
      const path = join(directory, `speech-${id}.wav`);
      await execute('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(id * 60), '-i', 'data/test-stream/recording.wav', '-t', '15', '-ar', '16000', '-ac', '1', path], { windowsHide: true });
      const wav = await readFile(path);
      for (const context of [false, true]) {
        const transcript = await measure(`speech-${id}-${context ? 'context' : 'plain'}`, 'asr', config.MODEL_ASR,
          () => client.asr(wav, context ? previous : ''), (result) => ({ context, ...wordErrors(paragraph.text, result.text) }));
        if (!context && transcript) {
          segments.push({ id: `segment-${id}`, offset_s: id * 60, text: transcript.text });
          await writeFile(join(directory, `speech-${id}-transcript.json`), JSON.stringify(transcript), { mode: 0o600 });
        }
        if (context && transcript) previous = transcript.text;
      }
    }
    for (const model of candidates.vod.filter((candidate) => available.has(candidate))) {
      for (const question of [
        { id: 'vod-hit', text: 'What was the word for the treasure hunt?', expected: 'segment-4' },
        { id: 'vod-challenge', text: 'What was chosen for the next community challenge?', expected: 'segment-2' },
        { id: 'vod-miss', text: 'What was the plan for a trip to the desert?', expected: undefined }
      ]) {
        await measure(question.id, 'vod', model, () => client.structured('vod', model, vodProposalSchema, vodInstructions, { question: question.text, segments }),
          (result) => ({ found: result.found, valid_segment_ids: question.expected ? result.found && result.segment_ids.includes(question.expected) && result.segment_ids.every((id) => segments.some((segment) => segment.id === id)) : !result.found && result.segment_ids.length === 0 }));
      }
    }
  } finally {
    await mkdir('eval/results', { recursive: true });
    const report = { suite: 'models-probe', split: 'probe', sample_count: claims.length, created_at: new Date().toISOString(),
      git_commit: gitCommit, working_tree_dirty: workingTreeDirty,
      endpoint: new URL(config.MODELSTUDIO_BASE_URL).hostname, models: candidates, available_models: [...available],
      search_mode: options.search_mode, source_selection: options.search_mode === 'reference' ? 'Known reference URLs; retrieval and end-to-end performance are not evaluated.' : 'Provider web search',
      baseline_configuration: { triage: config.MODEL_TRIAGE, search: config.MODEL_SEARCH, judge: config.MODEL_JUDGE },
      speech_source: 'system speech in the original prerecorded Twitch test', baseline_latency_ms: baselineLatency,
      summary: summarizeProbe(claims, rows, baselineLatency),
      estimated_cost_usd: estimatedCost(client.calls), cost_basis: 'Published list prices; estimates exclude free quota and credit. Provider billing is authoritative.',
      rows, calls: client.calls };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.info(`Saved the probe measurements to ${reportPath}.`);
  }
}

void probe().catch((error: unknown) => {
  console.error(error instanceof ModelProviderError ? error.message : 'Model probe stopped. Inspect the recorded report and configuration.');
  process.exitCode = 1;
});
