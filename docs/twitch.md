# Twitch integration

## Surfaces

| Surface | Use | Code |
|---|---|---|
| EventSub over WebSocket | Chat messages, replies, deletions, user clears, chat clears, stream online/offline | [`eventsub-ws.ts`](../src/twitch/eventsub-ws.ts) |
| Send Chat Message | Threaded replies with `reply_parent_message_id`, app token first for the Chat Bot badge | [`publisher.ts`](../src/twitch/publisher.ts) |
| Create Clip From VOD | A clip of the confirmed earlier moment, from the broadcaster's archive | [`clips.ts`](../src/vod/clips.ts) |
| Create Clip | A recent moment when the archive route is unavailable | [`clips.ts`](../src/vod/clips.ts) |
| Get Streams, Get Videos | Stream start time and the in-progress archive, matched by `stream_id` | [`helix.ts`](../src/twitch/helix.ts) |
| Get Channel Information | Category and title, passed to triage so "the new update" means this game | [`helix.ts`](../src/twitch/helix.ts) |
| OBS Browser Source | The transparent overlay at `/overlay` | [`web/overlay`](../web/overlay/main.tsx) |
| OBS Custom Browser Dock | The review desk in its 380 px layout | [`web/dashboard`](../web/dashboard) |

The EventSub client subscribes within 10 seconds of `session_welcome`, resets its
watchdog on keepalives and notifications, follows `session_reconnect` to the new URL
before closing the old socket, and de-duplicates on `message_id`. Tokens are validated at
startup and every hour, and refreshed before expiry.

## Live checks on my channel

I ran these probes during test broadcasts on my channel. Each broadcast streamed a
prepared recording with a spoken script, so every expected moment had a known timecode.

| Check | Result | Record |
|---|---|---|
| EventSub delivers a message and a reply | Received, frames saved to `fixtures/twitch/` | [frames](../fixtures/twitch/probe-1792830555944.jsonl) |
| Threaded bot reply with the app token | Twitch confirmed `is_sent` | Probe run `1792830555944` |
| In-progress archive | Get Videos returned it; matched by `stream_id` | [response](../fixtures/twitch/library-videos.json) |
| Clip From VOD | [Playable clip](https://clips.twitch.tv/SolidApatheticBeeWutFace-Aesut8nnQ65cxgUE) | [response](../fixtures/twitch/vod-clip.json) |
| VOD offset correction | -3.4 s, measured by matching a decoded clip timecode | `.env.example` |
| `!real` reply becomes a stored request | Stored; acknowledgement sent in 593 ms | [report](../eval/results/twitch-core-1792847799669.json) |
| Moderator deletes the source message | Stored text and the copied request text removed | [report](../eval/results/twitch-core-1792847799669.json) |
| `!vod` about a moment 5.2 minutes earlier | Found; clip starts 0.09 s from the spoken word; threaded reply sent | [report](../eval/results/vod-live-1792855780317.json) |
| A chat vote during a live check | Vote counted once, bot vote excluded, duplicate rejected, reveal held for approval, one point awarded | [report](../eval/results/overlay-live-1792871642852.json) |

Every committed frame comes from Twitch. Account logins and IDs are replaced with demo
aliases before export.

## Tests on recorded traffic

[`tests/eventsub.test.ts`](../tests/eventsub.test.ts) and [`tests/chat-core.test.ts`](../tests/chat-core.test.ts)
feed the recorded frames into `EventSubWs` byte for byte. They cover the reply that starts
a check, the `!vod` reply, the deletion that cancels a check and scrubs its evidence,
duplicate notifications, the watchdog and the offline guard.

## Probe commands

```sh
npm run setup:twitch                 # authorize broadcaster and bot
npm run probe:twitch -- --live       # during a test broadcast
npm run probe:core -- --live
npm run probe:vod -- --live
npm run probe:overlay -- --live
```

[Setup](setup-twitch.md) covers the application registration and the automated test broadcast.
