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
  created_at: z.iso.datetime({ offset: true }), duration: z.string(), type: z.string()
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
  source_broadcaster_user_id: z.string().nullable().optional(),
  reply: z.looseObject({
    parent_message_id: z.string(), parent_message_body: z.string(),
    parent_user_id: z.string(), parent_user_login: z.string(), parent_user_name: z.string()
  }).nullable().optional()
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
  observed_clap_offset_s: z.number().nonnegative().optional(), correction_s: z.number().optional()
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
