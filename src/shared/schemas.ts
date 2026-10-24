import { z } from 'zod';

export const serverConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4747)
});

export const healthSchema = z.object({
  name: z.literal('chat-is-this-real'),
  status: z.literal('ok'),
  milestone: z.literal('M0')
});

export type Health = z.infer<typeof healthSchema>;

export const twitchConfigSchema = z.object({
  TWITCH_CLIENT_ID: z.string().trim().min(1),
  TWITCH_CLIENT_SECRET: z.string().trim().min(1),
  TWITCH_CHANNEL: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,25}$/),
  TWITCH_BOT: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,25}$/)
}).refine((value) => value.TWITCH_CHANNEL !== value.TWITCH_BOT, {
  message: 'The broadcaster and bot must use separate accounts.'
});

export type TwitchConfig = z.infer<typeof twitchConfigSchema>;
export const tokenRoleSchema = z.enum(['bot', 'broadcaster', 'app']);
export type TokenRole = z.infer<typeof tokenRoleSchema>;
export type UserTokenRole = Exclude<TokenRole, 'app'>;

export const twitchTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.array(z.string()).default([]),
  token_type: z.string()
});

export const twitchTokenValidationSchema = z.object({
  client_id: z.string().min(1),
  expires_in: z.number().int().nonnegative(),
  scopes: z.array(z.string()).nullable().transform((scopes) => scopes ?? []),
  login: z.string().nullable().optional(),
  user_id: z.string().nullable().optional()
});

export const storedTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_at: z.number().int().positive(),
  scopes: z.array(z.string()),
  login: z.string().optional(),
  user_id: z.string().optional()
});
export type StoredToken = z.infer<typeof storedTokenSchema>;

export const tokenFileSchema = z.object({
  version: z.literal(1),
  client_id: z.string().min(1),
  bot: storedTokenSchema.optional(),
  broadcaster: storedTokenSchema.optional(),
  app: storedTokenSchema.optional()
});
export type TokenFile = z.infer<typeof tokenFileSchema>;

export const oauthCallbackSchema = z.object({
  state: z.string().min(1).max(256),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(256).optional()
});

export const twitchStreamSchema = z.object({
  id: z.string().min(1), user_id: z.string(), type: z.string(),
  started_at: z.iso.datetime({ offset: true }), title: z.string(),
  game_name: z.string(), language: z.string()
});
export const twitchStreamsSchema = z.object({ data: z.array(twitchStreamSchema) });
export type TwitchStream = z.infer<typeof twitchStreamSchema>;

export const twitchVideoSchema = z.object({
  id: z.string().regex(/^\d+$/), stream_id: z.string().nullable(), user_id: z.string(),
  created_at: z.iso.datetime({ offset: true }), duration: z.string(), type: z.string(), title: z.string().default('Past broadcast')
});
export const twitchVideosSchema = z.object({ data: z.array(twitchVideoSchema) });
export const twitchClipCreatedSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1), edit_url: z.url() })).min(1)
});
export const twitchClipsSchema = z.object({
  data: z.array(z.object({
    id: z.string(), url: z.url(), broadcaster_id: z.string(),
    video_id: z.string(), vod_offset: z.number().nullable(), duration: z.number()
  }))
});
export const twitchClipDownloadsSchema = z.object({ data: z.array(z.object({
  clip_id: z.string(), landscape_download_url: z.url().nullable(), portrait_download_url: z.url().nullable().optional()
})) });
export const twitchChatSentSchema = z.object({
  data: z.array(z.object({
    message_id: z.string(), is_sent: z.boolean(),
    drop_reason: z.object({ code: z.string(), message: z.string() }).nullable().optional()
  })).min(1)
});
export const eventSubEnvelopeSchema = z.object({
  metadata: z.looseObject({ message_id: z.string(), message_type: z.string(), message_timestamp: z.string() }),
  payload: z.looseObject({
    session: z.looseObject({
      id: z.string(), keepalive_timeout_seconds: z.number().nullable().optional(),
      reconnect_url: z.string().nullable().optional()
    }).optional(),
    subscription: z.looseObject({ type: z.string(), status: z.string() }).optional(),
    event: z.record(z.string(), z.unknown()).optional()
  })
});
export type EventSubEnvelope = z.infer<typeof eventSubEnvelopeSchema>;

export const twitchChatEventSchema = z.looseObject({
  broadcaster_user_id: z.string(), chatter_user_id: z.string(),
  chatter_user_login: z.string(), chatter_user_name: z.string(),
  message_id: z.string(), message: z.looseObject({ text: z.string() }),
  badges: z.array(z.object({ set_id: z.string(), id: z.string(), info: z.string().default('') })).default([]),
  source_broadcaster_user_id: z.string().nullable().optional(),
  reply: z.looseObject({
    parent_message_id: z.string(), parent_message_body: z.string(),
    parent_user_id: z.string(), parent_user_login: z.string(), parent_user_name: z.string()
  }).nullable().optional()
});
export type TwitchChatEvent = z.infer<typeof twitchChatEventSchema>;
export const chatSettingsSchema = z.object({
  history_enabled: z.boolean().default(false), retention_days: z.number().int().min(1).max(90).default(14),
  permission: z.enum(['moderators', 'vips', 'everyone']).default('moderators'),
  cooldown_s: z.number().int().min(1).max(3600).default(60),
  real_command: z.string().regex(/^![a-z][a-z0-9_]{0,20}$/u).default('!real'),
  vod_command: z.string().regex(/^![a-z][a-z0-9_]{0,20}$/u).default('!vod')
}).refine((settings) => settings.real_command !== settings.vod_command, 'Commands must have distinct names.');
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export const chatSettingsPatchSchema = z.object({
  history_enabled: chatSettingsSchema.shape.history_enabled.removeDefault().optional(),
  retention_days: chatSettingsSchema.shape.retention_days.removeDefault().optional(),
  permission: chatSettingsSchema.shape.permission.removeDefault().optional(),
  cooldown_s: chatSettingsSchema.shape.cooldown_s.removeDefault().optional(),
  real_command: chatSettingsSchema.shape.real_command.removeDefault().optional(),
  vod_command: chatSettingsSchema.shape.vod_command.removeDefault().optional()
}).strict();
export const oauthStartParamsSchema = z.object({ role: z.enum(['broadcaster', 'bot']) });
export const storedMessageSchema = z.object({
  id: z.string(), broadcast_id: z.string(), user_id: z.string(), user_login: z.string(), display_name: z.string(),
  body: z.string().nullable(), badges: z.array(z.object({ set_id: z.string(), id: z.string(), info: z.string() })),
  parent_id: z.string().nullable(), created_at: z.iso.datetime(), scope: z.enum(['history', 'check']),
  removed_reason: z.enum(['moderation', 'user_request', 'retention']).nullable()
});
export type StoredMessage = z.infer<typeof storedMessageSchema>;
export const checkRequestSchema = z.object({
  id: z.string(), kind: z.enum(['real', 'vod']), body: z.string().max(1000), broadcast_id: z.string(),
  author_user_id: z.string(), original_message_id: z.string(), command_message_id: z.string(),
  context_ids: z.array(z.string()).max(5), source_message_ids: z.array(z.string()).min(1),
  created_at: z.iso.datetime(), state: z.enum(['queued', 'cancelled']), source: z.enum(['chat', 'dashboard'])
});
export type CheckRequest = z.infer<typeof checkRequestSchema>;
export const chatDbRowSchema = z.object({
  id: z.string(), broadcast_id: z.string(), user_id: z.string(), user_login: z.string(), display_name: z.string(),
  body: z.string().nullable(), badges_json: z.string(), parent_id: z.string().nullable(), created_at: z.string(),
  scope: z.string(), removed_reason: z.string().nullable()
});
export const requestDbRowSchema = z.object({
  id: z.string(), kind: z.string(), body: z.string(), broadcast_id: z.string(), author_user_id: z.string(),
  original_message_id: z.string(), command_message_id: z.string(), context_ids_json: z.string(),
  source_ids_json: z.string(), created_at: z.string(), state: z.string(), source: z.string()
});
export const moderationEventSchema = z.object({ broadcaster_user_id: z.string(), message_id: z.string().optional(), target_user_id: z.string().optional() });
export const removalScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), id: z.string() }), z.object({ type: z.literal('user'), id: z.string() }),
  z.object({ type: z.literal('stream'), id: z.string() })
]);
export type RemovalScope = z.infer<typeof removalScopeSchema>;
export const historyQuerySchema = z.object({
  user: z.string().max(100).optional(), stream: z.string().max(100).optional(), q: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});
export const historyPurgeSchema = z.object({ user_id: z.string().min(1).max(100) });
export const chatEnvironmentSchema = z.object({ CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(14) });
export const purgeOptionsSchema = z.object({ user: z.string().regex(/^[a-zA-Z0-9_]{3,25}$/u).transform((value) => value.toLowerCase()) });
export const sourceTiersSchema = z.object({ official_domains: z.array(z.string()), institutional_domains: z.array(z.string()),
  institutional_suffixes: z.array(z.string()), press_domains: z.array(z.string()) });
export const checkStateSchema = z.enum(['queued', 'triage', 'searching', 'reading', 'judging', 'ready', 'not_a_claim', 'failed', 'on_air', 'dismissed']);
export type CheckState = z.infer<typeof checkStateSchema>;
export const checkInputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/u), claim: z.string().min(1).max(1000),
  context: z.array(z.object({ id: z.string(), text: z.string().max(1000) })).max(5).default([]),
  channel: z.object({ title: z.string().max(500), category: z.string().max(100), language: z.string().max(20) })
    .default({ title: '', category: '', language: 'en' })
});
export type CheckInput = z.infer<typeof checkInputSchema>;
export const createCheckSchema = z.object({
  claim: z.string().trim().min(1).max(1000).optional(), message_id: z.string().min(1).max(100).optional(),
  kind: z.enum(['real', 'vod']).default('real')
}).strict().refine((value) => Boolean(value.claim || value.message_id), 'Choose a message or enter a claim.');
export const checkIdParamsSchema = z.object({ id: checkInputSchema.shape.id });
export const twitchChannelInfoSchema = z.object({ data: z.array(z.object({
  title: z.string(), game_name: z.string(), broadcaster_language: z.string()
})) });
export const engineConfigSchema = z.object({
  SEARCH_MODE: z.enum(['replay', 'provider']).default('replay'), SEARCH_REPLAY_PATH: z.string().default('fixtures/search/probe.json'),
  MODELSTUDIO_TOKEN_LIMIT: z.coerce.number().int().min(1000).max(1_000_000).default(900_000),
  MODELSTUDIO_ASR_SECONDS_LIMIT: z.coerce.number().min(16).max(36_000).default(30_000)
});

export const probeOptionsSchema = z.object({
  live: z.boolean(),
  seconds: z.number().int().min(30).max(1800).default(600)
});

export const eventSubCreatedSchema = z.object({
  data: z.array(z.object({ id: z.string(), status: z.string() })).min(1)
});
export const probeReportSchema = z.object({
  run: z.string().regex(/^\d{13}$/), recorded_at: z.iso.datetime(),
  stream_id: z.string(), stream_started_at: z.iso.datetime({ offset: true }),
  broadcaster_id: z.string(), bot_id: z.string(),
  vod_id: z.string().optional(), in_progress_vod_listed: z.boolean().default(false), normal_message: z.boolean().default(false),
  reply_message: z.boolean().default(false), threaded_reply: z.boolean().default(false),
  vod_clip_id: z.string().optional(), live_clip_id: z.string().optional(),
  vod_clip_playable: z.boolean().default(false), live_clip_playable: z.boolean().default(false),
  vod_clip_status: z.string().default('waiting'),
  source: z.enum(['manual', 'recording']).default('manual'),
  alignment_clip_id: z.string().optional(), alignment_clip_start_s: z.number().nonnegative().optional(),
  recording_alignment: z.object({
    source_wall_start_ms: z.number(), source_offset_s: z.number().nonnegative(),
    observed_vod_offset_s: z.number().nonnegative(), method: z.literal('video_timecode_match')
  }).optional(),
  clap_wall_ms: z.number().optional(), clap_unadjusted_offset_s: z.number().optional(),
  observed_clap_offset_s: z.number().nonnegative().optional(), correction_s: z.number().optional(),
  core_request_created: z.boolean().optional(), moderated_text_removed: z.boolean().optional(), acknowledgement_sent: z.boolean().optional(), acknowledgement_ms: z.number().nonnegative().optional()
});
export type ProbeReport = z.infer<typeof probeReportSchema>;

export const testStreamOutlineSchema = z.array(z.object({
  id: z.number().int().min(0).max(19), text: z.string().min(1).max(1000)
})).length(20);

export const twitchEmptyResponseSchema = z.null();
export const twitchStreamKeySchema = z.object({ data: z.array(z.object({ stream_key: z.string().min(12) })).length(1) });
export const twitchChannelsSchema = z.object({ data: z.array(z.object({
  broadcaster_id: z.string(), title: z.string(), game_id: z.string(), broadcaster_language: z.string()
})).min(1) });
export const twitchGamesSchema = z.object({ data: z.array(z.object({ id: z.string(), name: z.string() })) });
export const twitchSharedChatSchema = z.object({ data: z.array(z.unknown()) });
export const twitchIngestsSchema = z.object({ ingests: z.array(z.object({
  name: z.string(), url_template_secure: z.url()
})).min(1) });
export const testBroadcastSchema = z.object({
  created_at: z.iso.datetime(), encoder_pid: z.number().int(), encoder_started_ms: z.number(),
  source_wall_start_ms: z.number().optional(), source_seconds: z.number().default(0),
  stream_id: z.string().optional(), stream_started_at: z.iso.datetime({ offset: true }).optional(),
  ended_at: z.iso.datetime().optional()
});
export const testBroadcastOptionsSchema = z.object({ live: z.boolean(), seconds: z.number().int().min(60).max(1200).default(1200) });

export const modelConfigSchema = z.object({
  DASHSCOPE_API_KEY: z.string().min(1),
  MODELSTUDIO_BASE_URL: z.url().default('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  MODEL_TRIAGE: z.string().default('qwen3.8-flash'), MODEL_SEARCH: z.string().default('qwen3.8-flash'),
  MODEL_JUDGE: z.string().default('qwen3.8-max'), MODEL_VOD: z.string().default('qwen3.8-flash'),
  MODEL_ASR: z.string().default('qwen-audio-3.1-asr-flash'), MODEL_ASR_FALLBACK: z.string().default('qwen3-asr-flash'),
  MODELSTUDIO_ALLOW_PAID_SEARCH: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ASR_LANGUAGE: z.string().default('en')
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export const modelRoleSchema = z.enum(['triage', 'search', 'judge', 'vod', 'asr', 'availability']);
export type ModelRole = z.infer<typeof modelRoleSchema>;
export const verdictSchema = z.enum(['real', 'not_real', 'missing_context', 'unconfirmed']);
export type Verdict = z.infer<typeof verdictSchema>;
export const triageSchema = z.object({
  kind: z.enum(['fact', 'stream_memory', 'opinion', 'joke', 'question', 'other']),
  checkable: z.boolean(), normalized_claim: z.string().max(1000),
  time_sensitive: z.boolean(), sensitive: z.boolean(), search_queries: z.array(z.string().max(250)).max(3)
});
export type Triage = z.infer<typeof triageSchema>;
export const evidenceSchema = z.object({
  source_id: z.string().max(100), excerpt: z.string().max(1000), stance: z.enum(['supports', 'contradicts', 'context'])
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const judgeSchema = z.object({
  verdict: verdictSchema, explanation: z.string().max(200), evidence: z.array(evidenceSchema).max(6)
});
export type JudgeProposal = z.infer<typeof judgeSchema>;
export const vodProposalSchema = z.object({
  found: z.boolean(), segment_ids: z.array(z.string().max(100)).max(20),
  relation: z.enum(['said', 'said_similar', 'said_opposite', 'not_found']), summary: z.string().max(160)
});
export type VodProposal = z.infer<typeof vodProposalSchema>;
export const modelUsageSchema = z.object({
  id: z.string(), created_at: z.iso.datetime(), role: modelRoleSchema, model: z.string(),
  latency_ms: z.number().nonnegative(), input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative(),
  search_calls: z.number().int().nonnegative(), status: z.enum(['ok', 'error']),
  error_code: z.string().nullable(), format: z.enum(['json_schema', 'json_object', 'responses', 'native', 'text']),
  audio_seconds: z.number().nonnegative().default(0), audio_seconds_estimated: z.boolean().default(false)
});
export type ModelUsage = z.infer<typeof modelUsageSchema>;
export const searchSourceSchema = z.object({ url: z.url(), title: z.string().optional() });
export const providerSearchSchema = z.object({
  output: z.array(z.looseObject({
    type: z.string(), action: z.looseObject({ sources: z.array(searchSourceSchema).optional() }).optional(),
    content: z.array(z.looseObject({ annotations: z.array(z.looseObject({
      type: z.string(), url: z.string().optional(), title: z.string().optional()
    })).optional() })).optional()
  })),
  usage: z.looseObject({
    input_tokens: z.number().optional(), output_tokens: z.number().optional(),
    x_tools: z.object({ web_search: z.object({ count: z.number() }).optional() }).optional()
  }).nullable().optional()
});
export const asrWordSchema = z.object({
  text: z.string(), begin_time: z.number().nonnegative(), end_time: z.number().nonnegative(),
  fixed: z.boolean().optional(), punctuation: z.string().optional()
});
export const nativeAsrSchema = z.object({
  output: z.object({ text: z.string(), sentence: z.object({ words: z.array(asrWordSchema) }).optional() }),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional(), duration: z.number().optional() }).optional()
});
export const sourceDocumentSchema = z.object({
  id: z.string(), url: z.url(), title: z.string(), domain: z.string(),
  tier: z.number().int().min(1).max(4), fetched_at: z.iso.datetime(), status: z.number().int(),
  sha256: z.string(), text: z.string(), error: z.string().optional(),
  origin: z.enum(['live_fetch', 'recorded_render']).default('live_fetch')
});
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export const sourceSummarySchema = sourceDocumentSchema.omit({ text: true });
export const providerChatSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number(), seconds: z.number().nonnegative().optional() }).optional()
});
export const probeClaimSchema = z.object({
  id: z.string(), message: z.string(), expected_kind: triageSchema.shape.kind,
  expected_verdict: verdictSchema.nullable(), reference_url: z.url().nullable()
});
export const probeClaimsSchema = z.array(probeClaimSchema).length(10);
export const modelProbeRowSchema = z.object({
  id: z.string(), role: modelRoleSchema, model: z.string(), status: z.enum(['ok', 'error', 'skipped']),
  elapsed_ms: z.number(), expected_kind: triageSchema.shape.kind.optional(), kind: triageSchema.shape.kind.optional(),
  checkable: z.boolean().optional(), source_fetch_ms: z.number().optional(),
  expected_verdict: verdictSchema.nullable().optional(), verdict: verdictSchema.optional(),
  returned_excerpts: z.number().optional(), verified_excerpts: z.number().optional(), source_count: z.number().optional(),
  found: z.boolean().optional(), valid_segment_ids: z.boolean().optional(),
  word_errors: z.number().optional(), reference_words: z.number().optional(), context: z.boolean().optional(),
  error: z.string().optional(), skipped_reason: z.enum(['triage_not_checkable', 'no_sources']).optional()
});
export type ModelProbeRow = z.infer<typeof modelProbeRowSchema>;
export const modelProbeOptionsSchema = z.object({
  live: z.boolean(), budget_usd: z.number().positive().max(20).default(1),
  search_mode: z.enum(['reference', 'replay', 'provider']).default('reference')
});
export const availabilitySchema = z.object({ ok: z.literal(true) });
export const modelProbeMeasurementsSchema = z.object({
  suite: z.literal('models-probe'), split: z.literal('probe'), sample_count: z.number().int().positive(),
  created_at: z.iso.datetime(), git_commit: z.string().regex(/^[0-9a-f]{40}$/),
  search_mode: z.enum(['reference', 'replay', 'provider']), endpoint: z.string(),
  rows: z.array(modelProbeRowSchema), calls: z.array(modelUsageSchema),
  baseline_latency_ms: z.array(z.number().nonnegative()),
  replay_latency_ms: z.array(z.number().nonnegative()).default([])
});
export const searchReplaySchema = z.object({
  origin: z.literal('host_web_search_curated'), recorded_at: z.iso.datetime(), description: z.string(),
  items: z.array(z.object({ id: z.string(), claim: z.string(), query: z.string(), sources: z.array(searchSourceSchema).max(6),
    documents: z.array(sourceDocumentSchema).max(6).default([]) }))
});
export const evaluationSourceCatalogSchema = z.record(z.string(), z.url());
export const evaluationVerdictSchema = z.enum(['real', 'not_real', 'missing_context', 'unconfirmed', 'not_a_claim']);
export const evaluationClaimSchema = z.object({
  id: z.string().regex(/^claim-\d{3}$/u), message: z.string().min(1).max(1000),
  category: z.enum(['gaming', 'programming', 'science', 'time_sensitive', 'not_claim', 'injection', 'missing_context']),
  expected_kind: triageSchema.shape.kind, expected_verdict: evaluationVerdictSchema,
  reference_url: z.url().nullable(), reference_excerpt: z.string().nullable(),
  reference_sha256: z.string().nullable(), reference_fetched_at: z.iso.datetime().nullable(),
  split: z.enum(['dev', 'heldout']), notes: z.string()
});
export type EvaluationClaim = z.infer<typeof evaluationClaimSchema>;
export const transcriptSegmentSchema = z.object({
  id: z.string(), broadcast_id: z.string(), vod_id: z.string().nullable(),
  offset_s: z.number().nonnegative(), duration_s: z.number().positive(), text: z.string(),
  words: z.array(asrWordSchema), source: z.enum(['live', 'upload']), created_at: z.iso.datetime()
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export const broadcastSchema = z.object({
  id: z.string().min(1).max(100), vod_id: z.string().regex(/^\d+$/u).nullable(), title: z.string().max(300),
  started_at: z.iso.datetime(), source: z.enum(['live', 'upload']), created_at: z.iso.datetime()
});
export type Broadcast = z.infer<typeof broadcastSchema>;
export const transcriptCoverageSchema = z.object({
  broadcast_id: z.string(), start_s: z.number().nonnegative(), end_s: z.number().nonnegative(),
  segment_count: z.number().int().nonnegative(), gaps: z.array(z.object({ start_s: z.number(), end_s: z.number() }))
});
export type TranscriptCoverage = z.infer<typeof transcriptCoverageSchema>;
export const clipResultSchema = z.object({
  state: z.enum(['pending', 'ready', 'fallback', 'failed']), clip_id: z.string().nullable(),
  clip_url: z.url().nullable(), vod_url: z.url(), reason: z.string().nullable()
});
export type ClipResult = z.infer<typeof clipResultSchema>;
export const vodOutcomeSchema = z.object({
  id: z.string(), type: z.literal('vod'), found: z.boolean(),
  relation: vodProposalSchema.shape.relation, segment_ids: z.array(z.string()), quote: z.string().max(300),
  offset_s: z.number().nonnegative().nullable(), end_s: z.number().nonnegative().nullable(),
  broadcast_id: z.string().nullable(), vod_id: z.string().regex(/^\d+$/u).nullable(), broadcast_title: z.string(),
  broadcast_started_at: z.iso.datetime().nullable(), timing: z.enum(['word', 'segment']).nullable(),
  coverage: z.array(transcriptCoverageSchema), clip: clipResultSchema.nullable(),
  reason: z.string().nullable(), created_at: z.iso.datetime(), elapsed_ms: z.number().nonnegative(),
  calls: z.array(modelUsageSchema), failed: z.boolean().default(false)
});
export type VodOutcome = z.infer<typeof vodOutcomeSchema>;
export const companionConfigSchema = z.object({
  AUDIO_INPUT_FORMAT: z.enum(['dshow', 'avfoundation', 'pulse']).default('dshow'),
  AUDIO_DEVICE: z.string().min(1), VOD_OFFSET_CORRECTION_S: z.coerce.number().min(-120).max(120).default(0),
  COMPANION_SERVER: z.url().default('http://127.0.0.1:4747')
});
export const companionStateSchema = z.object({ broadcast_id: z.string(), started_at: z.iso.datetime({ offset: true }),
  vod_id: z.string().regex(/^\d+$/u).nullable(), title: z.string(), category: z.string(), channel: z.string(), commands: z.array(z.string()) });
export const companionOptionsSchema = z.object({ list: z.boolean().default(false), file: z.string().optional(),
  wall_start: z.iso.datetime({ offset: true }).optional(), seconds: z.coerce.number().positive().max(10_800).optional() });
export const ingestTranscriptSchema = z.object({
  broadcast_id: z.string().min(1).max(100), chunk_wall_start: z.iso.datetime(), duration_s: z.number().positive().max(16),
  text: z.string().max(8000), words: z.array(asrWordSchema).max(1000), chunk_id: z.string().uuid()
});
export const asrVocabularySchema = z.record(z.string().min(1).max(80), z.number().int().min(1).max(5));
export const subtitleUploadSchema = z.object({ vod_id: z.string().regex(/^\d+$/u), format: z.enum(['srt', 'vtt', 'txt']), text: z.string().min(1).max(800_000) });
export const libraryParamsSchema = z.object({ vod_id: z.string().regex(/^\d+$/u) });
export const mediaInfoSchema = z.object({ format: z.object({ duration: z.coerce.number().positive().max(10_800) }) });
export const mediaImportSchema = z.object({
  id: z.string(), vod_id: z.string(), state: z.enum(['receiving', 'transcribing', 'ready', 'failed']),
  progress_s: z.number().nonnegative(), total_s: z.number().nonnegative().nullable(), reason: z.string().nullable(), created_at: z.iso.datetime()
});
export type MediaImport = z.infer<typeof mediaImportSchema>;
export const librarySearchSchema = z.object({ broadcast_id: z.string().max(100).optional(), q: z.string().max(1000).default('') });
export const clipApprovalSchema = z.object({ confirmed: z.literal(true) });
export const recordedBroadcastSchema = z.object({ broadcast_id: z.string(), vod_id: z.string(), stream_started_at: z.iso.datetime({ offset: true }), origin: z.string() });
export const vodEvaluationSourceSchema = z.object({ broadcast_id: z.string(), vod_id: z.string(), source_duration_s: z.number(), alignment_s: z.number() });
export const vodEvaluationQuestionSchema = z.object({
  id: z.string(), question: z.string(), expected: z.enum(['found', 'not_found']),
  offset_min_s: z.number().nonnegative().nullable(), offset_max_s: z.number().nonnegative().nullable(), notes: z.string()
});
export const evaluationLockSchema = z.object({
  version: z.literal(1), data_commit: z.string().regex(/^[0-9a-f]{40}$/u), created_at: z.iso.datetime(),
  files: z.array(z.object({
    path: z.enum(['eval/claims.jsonl', 'eval/vod/transcript.jsonl', 'eval/vod/questions.jsonl', 'eval/vod/source.json']),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u)
  })).length(4)
});
export const evaluationOptionsSchema = z.object({
  suite: z.enum(['claims', 'vod']).default('claims'), split: z.enum(['dev', 'heldout']).default('dev'), verify_lock: z.boolean().default(false)
});
export const checkOutcomeSchema = z.object({
  id: z.string(), type: z.enum(['fact', 'not_a_claim', 'stream_memory']), normalized_claim: z.string(),
  triage: triageSchema.nullable(), final_verdict: evaluationVerdictSchema, model_verdict: verdictSchema.nullable(),
  explanation: z.string(), evidence: z.array(evidenceSchema), sources: z.array(sourceDocumentSchema),
  returned_excerpts: z.number().int().nonnegative(), dropped_excerpts: z.number().int().nonnegative(),
  sensitive: z.boolean(), reason: z.string().nullable(), created_at: z.iso.datetime(), elapsed_ms: z.number().nonnegative(),
  cache_hit: z.boolean(), retrieval_mode: z.enum(['replay', 'provider']), calls: z.array(modelUsageSchema), failed: z.boolean().default(false)
});
export type CheckOutcome = z.infer<typeof checkOutcomeSchema>;
export const checkJobSchema = z.object({
  id: z.string(), request_id: z.string().nullable(), kind: z.enum(['real', 'vod']), state: checkStateSchema,
  input: checkInputSchema.nullable(), outcome: z.union([checkOutcomeSchema, vodOutcomeSchema]).nullable(), reason: z.string().nullable(),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime()
});
export type CheckJob = z.infer<typeof checkJobSchema>;
export const dashboardSessionSchema = z.object({ csrf_token: z.string().regex(/^[a-f0-9]{64}$/u) });
export const requestListSchema = z.object({ requests: z.array(checkRequestSchema) });
export const checkListSchema = z.object({ checks: z.array(checkJobSchema) });
export const checkJobRowSchema = z.object({
  id: z.string(), request_id: z.string().nullable(), kind: z.string(), state: z.string(), input_json: z.string().nullable(),
  outcome_json: z.string().nullable(), reason: z.string().nullable(), created_at: z.string(), updated_at: z.string()
});
export const claimRunSummarySchema = z.object({
  suite: z.literal('claims'), split: z.enum(['dev', 'heldout']), sample_count: z.number(), attempted_items: z.number(),
  git_commit: z.string(), working_tree_dirty: z.boolean(), models: z.object({ judge: z.string() }), retrieval_mode: z.enum(['replay', 'provider']),
  metrics: z.object({
    verdict_agreement: z.object({ matched: z.number(), total: z.number() }),
    by_category: z.record(z.string(), z.object({ matched: z.number(), total: z.number(), attempted: z.number() })),
    wrong_direction_errors: z.number(), injection_directional_errors: z.number(),
    injection_coverage: z.object({ attempted: z.number(), total: z.number() }),
    not_a_claim: z.object({ true_positive: z.number(), predicted: z.number(), expected: z.number() }),
    excerpts: z.object({ verified: z.number(), returned: z.number() }),
    latency_ms: z.object({ sample_count: z.number(), p50: z.number().nullable(), p90: z.number().nullable() }),
    failed_items: z.number(), not_attempted: z.number()
  })
});
export const engineProbeSummarySchema = z.object({
  suite: z.literal('engine-probe'), unique_items: z.number(), planned_repetitions: z.number(),
  working_tree_dirty: z.boolean(), rows: z.array(z.object({ expected: z.string(), output: z.object({ final_verdict: z.string() }) }))
});
export const vodRunSummarySchema = z.object({
  git_commit: z.string(), model: z.string(), sample_count: z.number(), attempted_items: z.number(),
  metrics: z.object({ hit_within_15s: z.object({ matched: z.number(), total: z.number(), target: z.string().optional() }),
    not_found_correctness: z.object({ matched: z.number(), total: z.number() }), failed_items: z.number(), not_attempted: z.number() })
});
export const liveVodSummarySchema = z.object({
  passed: z.boolean().default(false), stage: z.string().default('not_recorded'),
  offset_error_s: z.number().optional(), aligned_offset_error_s: z.number().optional(),
  clip_playable: z.boolean().default(false), reply_sent: z.boolean().default(false)
});
