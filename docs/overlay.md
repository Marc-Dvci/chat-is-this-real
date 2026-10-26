# Overlay and chat votes

The overlay runs at `http://localhost:4747/overlay` as a transparent 1920 × 1080 OBS
Browser Source. It receives the same stored presentation as the desk over SSE.

## Sequence

| Phase | On stream |
|---|---|
| Checking | The claim without a username, the banner **CHAT, IS THIS REAL?**, `1 = REAL · 2 = NOT REAL` and live vote bars |
| Reveal | The verdict stamp lands in 600 ms, with **CHAT SAID 64% REAL** and one verified source domain |
| Dwell | The card holds for the configured time (12 s by default), then exits |
| Stream memory | **IT'S IN THE VOD** with the stored quote and its stream time, in its own colour family |

The reveal waits for the streamer's approval. A ready result never reaches the overlay
before that click.

## Votes

- Only a message whose trimmed text is exactly `1` or `2` counts.
- Each viewer's first vote counts; the bot is excluded.
- The window runs from the start of the check until the result is ready: at least 20 s,
  at most 60 s. A fast check still gets its suspense.
- REAL and NOT REAL award one point to each correct caller after the approved reveal.
  MISSING CONTEXT and UNCONFIRMED show **NO CALL · NO POINTS AWARDED**.
- Hiding, cancelling or restarting an unfinished round awards nothing.
- The desk lists the top callers for the stream. The optional on-stream leaderboard shows
  anonymous ranks.

## Design

The "replay booth" identity borrows the rhythm of a sports replay review: the banner, the
hold, the decision. Angled lower-third shapes, Barlow Condensed for banners and stamps,
Inter for body text, both self-hosted under the OFL.

| Token | Value |
|---|---|
| REAL | `#22C55E` |
| NOT REAL | `#F43F5E` |
| MISSING CONTEXT | `#F59E0B` |
| UNCONFIRMED | `#94A3B8` |
| Stream memory | `#22D3EE` |

Body text is at least 30 px and the verdict at least 72 px at 1080p. Motion follows the
saved setting and `prefers-reduced-motion`. The overlay plays no sound.

## Checks

[`e2e/overlay-votes.spec.ts`](../e2e/overlay-votes.spec.ts) runs a scripted check and, at
each step, reads the desk state, the overlay DOM and a separate SQLite connection, and
asserts that all three agree. [`tests/votes.test.ts`](../tests/votes.test.ts) and
[`tests/recorded-votes.test.ts`](../tests/recorded-votes.test.ts) cover duplicates, late
votes, non-votes, window bounds, restarts and purges, using recorded Twitch frames.
