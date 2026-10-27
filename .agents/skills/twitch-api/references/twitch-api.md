# Twitch API reference for this project (checked 23 Oct 2026)

## OAuth (https://dev.twitch.tv/docs/authentication/)
- Authorize: `GET https://id.twitch.tv/oauth2/authorize?client_id&redirect_uri&response_type=code&scope=<space-delimited>&state`. `force_verify=true` forces the account picker (use it for the bot account).
- Exchange: `POST https://id.twitch.tv/oauth2/token` (form): `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`.
- App token: `POST https://id.twitch.tv/oauth2/token` with `grant_type=client_credentials` (no scope parameter).
- Refresh: `grant_type=refresh_token`, `refresh_token` (URL-encoded), `client_id`, `client_secret`. The response may carry a new refresh token: store it.
- Lifetime: read `expires_in`; no fixed duration.
- Validate: `GET https://id.twitch.tv/oauth2/validate` with `Authorization: OAuth <token>`. **Required at startup and every hour.** Returns `client_id`, `scopes`, `expires_in`, `login`, `user_id` (null for app tokens). Invalid: HTTP 401.
- The account that registers the application needs two-factor authentication.

## Scopes used
| Token | Scopes |
|---|---|
| Bot user | `user:read:chat`, `user:write:chat`, `user:bot` |
| Broadcaster user | `channel:bot`, `channel:manage:clips`, `clips:edit` |
| App (client credentials) | none (inherits the users' grants for chat; gives the Chat Bot badge) |

## EventSub over WebSocket
- URL `wss://eventsub.wss.twitch.tv/ws`. Optional `?keepalive_timeout_seconds=` 10 to 600.
- **User access tokens only.** App tokens make WebSocket subscriptions fail.
- `session_welcome` carries `payload.session.id`. **Subscribe within 10 s** with `POST https://api.twitch.tv/helix/eventsub/subscriptions` and `transport: { method: "websocket", session_id }`.
- Each notification or keepalive resets the keepalive timer. With nothing for longer than the timeout, reconnect and resubscribe. Answer Ping with Pong.
- `session_reconnect` arrives 30 s before Twitch closes the connection. Open `reconnect_url` exactly as given. Keep the old connection until the new one sends its welcome. Subscriptions carry over, and the reconnect does not count as a new connection.
- Limits: 3 connections with enabled subscriptions, 300 subscriptions per connection, `max_total_cost` 10.

### `channel.chat.message` (v1)
- Condition: `broadcaster_user_id`, `user_id` (the bot, the user reading chat).
- Scope: `user:read:chat` from the bot.
- Event fields used: `message_id`, `chatter_user_id`, `chatter_user_login`, `chatter_user_name`, `message.text`, `message.fragments[]` (types text, cheermote, emote, mention, gif), `badges[]` (`set_id`, `id`, `info`), `reply`, `source_broadcaster_user_id` (Shared Chat; ignore commands from other channels).
- `reply`: `parent_message_id`, `parent_message_body`, `parent_user_id`, `parent_user_name`, `parent_user_login`, `thread_message_id`, `thread_user_id`, `thread_user_name`, `thread_user_login`.
- twitch.tv's web chat adds `@<thread starter>` to the start of a reply's text. Strip leading mentions before reading a command; other clients may add none.

### Moderation events (same condition and scope as above)
- `channel.chat.message_delete`: `target_user_id`, `target_user_login`, `message_id`.
- `channel.chat.clear_user_messages`: `target_user_id`, `target_user_login` (a ban or timeout; all their messages are removed).
- `channel.chat.clear`: broadcaster fields only.

### Stream events (no authorization scope; still created with the bot's user token over WebSocket)
- `stream.online`: `id` (the stream id), `type` (`live`, `playlist`, `watch_party`, `premiere`, `rerun`), `started_at`.
- `stream.offline`: `id` and broadcaster fields.

## Helix
### Send Chat Message: `POST https://api.twitch.tv/helix/chat/messages`
- Body: `broadcaster_id`, `sender_id` (must match the token's user), `message` (max 500 chars), optional `reply_parent_message_id`.
- An app token gives the Chat Bot badge. It requires `user:write:chat` + `user:bot` from the bot, and `channel:bot` from the broadcaster unless the bot is a moderator. A user token (`user:write:chat`) also works, without the badge.
- Response `data[]`: `message_id`, `is_sent`, `drop_reason { code, message }`. Errors: 400, 401, 403, 422 (too large), 429.

### Get Channel Information: `GET https://api.twitch.tv/helix/channels?broadcaster_id=`
- App or user token. Fields: `game_name`, `title`, `broadcaster_language`.

### Get Videos: `GET https://api.twitch.tv/helix/videos?user_id=&type=archive`
- App or user token. Fields: `id`, `stream_id`, `user_id`, `created_at`, `published_at`, `duration` ("6h26m14s"), `url`, `type`, `viewable`.
- **Verify in M1:** whether the archive of the stream currently live is returned while live (match on `stream_id`).
- **Verify in M1:** the timestamp link format `https://www.twitch.tv/videos/<id>?t=1h2m3s`.

### Get Streams: `GET https://api.twitch.tv/helix/streams?user_id=`
- **Verify in M1:** `id` and `started_at` (the docs page could not be read on 23 Oct). `stream.online` gives the same two values.

### Create Clip From VOD (open beta since 20 Dec 2025): `POST https://api.twitch.tv/helix/videos/clips`
- App or user token with `channel:manage:clips` or `editor:manage:clips`.
- Required: `editor_id`, `broadcaster_id`, `vod_id`, `vod_offset`, `title`. Optional: `duration` (5 to 60, default 30).
- The clip covers `vod_offset - duration` to `vod_offset`, so `vod_offset >= duration`.
- Twitch: "a live stream is technically a VOD in the making"; it works for earlier moments of the current stream if VODs are enabled.
- Response `202` with `id`, `edit_url`. Creation is asynchronous.

### Create Clip (live): `POST https://api.twitch.tv/helix/clips?broadcaster_id=`
- User token with `clips:edit`. Optional `title`, `duration` (5 to 60, step 0.1, default 30). `has_delay` was removed.
- Captures up to 90 s around the call and publishes up to the last 30 s.

### Get Clips: `GET https://api.twitch.tv/helix/clips?id=`
- If the clip is not returned after 60 s, treat creation as failed.

### Polls and Predictions
- "Available to partners and affiliates only." This project counts `1` / `2` chat messages instead.

## Chat settings
- "Block hyperlinks" holds links for moderator review. Links from the broadcaster, moderators and VIPs are not held, so the bot is made a moderator (`/mod <bot>`).

## Extensions (M12)
- Types: Panel, Overlay ("displays on top of the whole video as a transparent overlay"), Component.
- Local Test and Hosted Test: installable on the developer's own channel, visible to the listed test accounts; no review needed to test.
- Frontend: `Twitch.ext.onAuthorized` gives `token` (JWT), `userId` (opaque), `channelId`, `clientId`, `helixToken`. Send the JWT as a header to the EBS.
- EBS: verify the JWT with the extension's shared secret, which is base64-encoded (decode it to bytes first). Payload fields: `exp`, `opaque_user_id`, `channel_id`, `role`, `pubsub_perms`, `user_id`.
- `POST https://api.twitch.tv/helix/extensions/pubsub`: EBS-signed JWT with `role: "external"`, header `Client-Id`; body `target` (["broadcast"]), `broadcaster_id`, `message` (max 5 KB). Limits: 100 messages per minute per client and broadcaster in the reference, and 1 per second per channel on the building page; respect the stricter one. Legacy Twitch PubSub was shut down in April 2025, and the docs do not say whether this endpoint is affected, so keep the polling fallback.

## Observed in M1 (24 Oct 2026)
- App-token validation returns `scopes: null` and omits `login` and `user_id`. Treat null scopes as an empty list for app tokens; continue enforcing all required scopes for user tokens.
- The scripted reply sent through Send Chat Message arrived with a leading parent mention in EventSub, including when the API input was just `!real`.
- Get Streams returned `id` and `started_at`. Get Videos returned the in-progress archive and its matching `stream_id`.
- Both Clip From VOD and live clip creation succeeded. The observed source alignment and recorded fixture provenance are in `docs/twitch.md`.
- Clip-download URLs from `GET /helix/clips/downloads` use CloudFront. The authorized clip was downloaded and decoded for source-timecode alignment. Source: https://dev.twitch.tv/docs/api/reference/#get-clips-download
- `https://ingest.twitch.tv/ingests` returns `url_template_secure` with an RTMPS endpoint. The optional prerecorded test-stream tool validates TLS with a CA bundle and never logs the stream key.
- Optional test automation additionally requests `channel:read:stream_key`, `channel:manage:broadcast` and `user:write:chat` from the broadcaster. These are not needed for normal bot operation.
- App-token chat messages explicitly use `for_source_only: true`. A user-token fallback can reach every channel in Shared Chat, so broadcaster test messages are blocked when a shared session is active. Source: https://dev.twitch.tv/docs/api/reference/#send-chat-message
- A blank extra redirect field can trigger the console's HTTPS error. Keep a single populated localhost callback field. Source: https://discuss.dev.twitch.com/t/unable-to-use-localhost-are-redirect-url-for-oauth-implicit-grant-flow/61951
## Observed in M4 (24 Oct 2026)
- The optional broadcaster test scope `moderator:manage:chat_messages` permits deleting the scripted test message with `DELETE /helix/moderation/chat` (`broadcaster_id`, `moderator_id`, `message_id`). The helper restricts deletion to IDs it sent itself.
- A real `channel.chat.message_delete` event removed the stored source and cancelled the copied request. The scrubbed recording and observed acknowledgement timing are in `docs/twitch.md`.
- `for_source_only` is app-token-only; including it with a user access token returns HTTP 400. The user-token fallback omits it and is blocked during Shared Chat. Verified source: https://dev.twitch.tv/docs/api/reference/#send-chat-message
- Get Shared Chat Session accepts app or user access tokens. The fallback queries it with the bot user token, so an invalid app grant does not prevent the safety check. Source: https://dev.twitch.tv/docs/api/reference/#get-shared-chat-session
