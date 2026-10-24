# Twitch probe

Recorded 2026-10-24T08:29:15.957Z. Run: `1792830555944`.

| Check | Observed result |
|---|---|
| Normal message and reply | Received through EventSub |
| Threaded bot reply | Sent with the app token; Twitch confirmed is_sent |
| In-progress archive | Returned by Get Videos and matched by stream_id |
| Clip From VOD | Playable clip returned |
| Live clip | Playable clip returned |
| Source timecode correction | -3.4 seconds |
| Recorded fixtures | 3 captured frames, with account identifiers pseudonymized |

Playable test clip: https://clips.twitch.tv/SolidApatheticBeeWutFace-Aesut8nnQ65cxgUE

Reproduce with `npm run probe:twitch -- --live` during an explicitly started test stream.
Capture files and account mappings stay under the ignored data directory.

The fixture export retains the scripted claim and reply. Usernames and identifiers are pseudonymized.
Protocol frames originate from Twitch; the exporter does not synthesize events.

This probe uses the original prerecorded test video and system speech.
Alignment matches a decoded Twitch clip timecode against the source video. Recalibrate for a different encoder or audio capture path.

API references: [EventSub](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) and
[Clip From VOD](https://dev.twitch.tv/docs/api/reference/#create-clip-from-vod).
