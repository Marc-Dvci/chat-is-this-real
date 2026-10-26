# Stream memory (`!vod`)

When chat says "you said that earlier", a moderator replies `!vod` and Chat Is This Real
returns the stored words, the time in the stream and a Twitch clip of that moment.

## Capture

`npm run companion` runs on the streaming PC, next to OBS.

1. FFmpeg captures the selected audio device in 15-second mono 16 kHz chunks
   (`dshow` on Windows, `avfoundation` on macOS, `pulse` on Linux). List devices with
   `npm run companion -- --list`.
2. Each chunk goes to `qwen-audio-3.1-asr-flash` with the previous chunk's transcript as
   context and hotwords for the channel, the category, the command names and "Chat".
3. The text and its word timestamps are stored as a segment in SQLite with FTS5. The audio
   file is deleted.

A quote's time is the offset of its first matched word: the chunk's position in the stream
plus the word's `begin_time`. It is accurate to the word.

## Answer

1. Retrieval sends a short stream whole. A longer one sends the top FTS5 candidates and
   their neighbours, with numbers expanded both ways ("fifty" and "50").
2. `qwen3.8-flash` returns `found`, contiguous `segment_ids`, a relation (said, said
   something similar, said the opposite, not found) and a short summary.
3. Code resolves the IDs. An unknown, foreign or non-contiguous ID turns the answer into
   not found. The quote is the stored text, trimmed to 300 characters around the best match.
4. A miss shows the indexed coverage, for example "Not found in the indexed part of this
   stream (0:00 to 1:12:30)".

The current stream is searched first, then recent past broadcasts. The answer names the
broadcast and its date.

## Clip

The streamer confirms the clip on the desk. Create Clip From VOD then cuts 30 to 60
seconds that cover the whole quote and end 8 seconds after it, from the broadcaster's
in-progress archive. The app polls Twitch every 2 seconds. If the clip takes longer than
20 seconds, the desk offers the VOD timestamp link and keeps polling for up to a minute.
A live clip covers a moment under a minute old.

Chat reply formats:

```text
IT'S IN THE VOD at 0:42:10: "<stored quote>" Clip: <clip url>
NOT FOUND in the indexed part of this stream (0:00 to 1:12:30).
```

## Past broadcasts

Library imports SRT, VTT or timestamped TXT, or an audio or video file that is chunked
and transcribed, and links it to one of the channel's VODs from a Get Videos picker.
Media is limited in size and duration, decoded without network protocols and removed after
processing. A failed import keeps the previous transcript.

## Measurements

20/20 moments found within ±15 s and 6/6 never-said questions answered "not found", in
each of 3 runs ([evaluation](evaluation.md)). On my channel, a `!vod` about a moment
5.2 minutes earlier produced a clip that starts 0.09 s from the spoken word ([Twitch](twitch.md)).
