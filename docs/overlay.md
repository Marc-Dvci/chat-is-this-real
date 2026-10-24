# Chat calls it

I use `/overlay` as a transparent 1920 × 1080 OBS Browser Source. The dashboard and overlay
receive SSE snapshots of the same stored presentation. The sequence is checking, reveal,
dwell and exit. The reveal lasts 600 ms. Motion respects the saved setting and reduced-motion
preferences. The source stays silent.

I open voting for a new claim that is on stream, after triage identifies a factual,
non-sensitive message. The initial banner acknowledges the check without publishing its
text before screening. A fast result waits for the configured minimum, at least 20 seconds.
A slow check closes voting at 60 seconds. Approval controls the reveal. A ready result is
not sent to the overlay while it waits for approval.

I count only a trimmed `1` or `2`, once per viewer and round. The bot is excluded. REAL and
NOT REAL award one point to a correct caller after the approved reveal. Qualified and
unconfirmed results award no points. Restarting, hiding or cancelling an unfinished round
prevents it from awarding points. The private desk shows the top callers for the stream.
The optional overlay ranks stay anonymous.

## Recorded checks

I test duplicate votes, late votes, non-votes, window bounds, restart and purge behavior.
The browser test compares the dashboard, overlay DOM and a separate SQLite read during
checking and dwell. It also checks the stored job state, vote count and score count.
Three scripted demo viewers use the same tally as incoming Twitch chat.

I retained every live attempt:

| Run | Observation |
|---|---|
| [First](../eval/results/overlay-live-1792871126221.json) | The command reached the app. Search stopped because the probe used a catalogue without that claim. No result was published. |
| [Second](../eval/results/overlay-live-1792871533007.json) | The real vote, bot filter, duplicate filter and withheld result passed. I started too late in the recording. The stream ended before the reveal and the round was cancelled. |
| [Third](../eval/results/overlay-live-1792871642852.json) | The real Twitch command, vote, bot exclusion, duplicate rejection, approval and single point passed. Search discovery used the curated dev catalogue. |

The third run observed one eligible voter. It does not satisfy the plan's separate
three-viewer OBS acceptance check. That check remains for final review with three distinct
viewer accounts. The three-viewer browser run is scripted. I captured the local overlay
in a headless browser. An OBS recording of the broadcast output remains for that final check.
